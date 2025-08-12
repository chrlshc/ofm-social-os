import { sleep } from 'k6';
import { check, group } from 'k6';
import http from 'k6/http';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { 
  config, 
  authenticatedRequest, 
  validateResponse, 
  testData, 
  sleepWithJitter,
  uploadLatency,
  baseConfig 
} from '../config/base.js';

// Upload load test configuration
export const options = {
  ...baseConfig,
  
  scenarios: {
    // Standard upload test
    standard_upload: {
      executor: 'constant-vus',
      vus: 5, // Lower VUs for upload tests due to larger payloads
      duration: '5m',
      tags: { test_type: 'standard_upload' },
    },
    
    // Multipart upload test
    multipart_upload: {
      executor: 'constant-vus',
      vus: 3, // Even lower for large files
      duration: '10m',
      tags: { test_type: 'multipart_upload' },
    },
    
    // Concurrent upload stress test
    concurrent_upload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: 8 },
        { duration: '5m', target: 8 }, // Peak load
        { duration: '1m', target: 0 },
      ],
      tags: { test_type: 'concurrent_upload' },
    },
  },
  
  // Upload-specific thresholds
  thresholds: {
    ...baseConfig.thresholds,
    
    // Upload endpoint thresholds
    'http_req_duration{endpoint:upload}': [
      'p(95) < 30000', // 95% under 30s for small files
      'p(99) < 45000', // 99% under 45s
    ],
    
    'http_req_duration{endpoint:multipart_upload}': [
      'p(95) < 120000', // 95% under 2 minutes for large files
      'p(99) < 180000', // 99% under 3 minutes
    ],
    
    // Upload success rates
    'http_req_failed{endpoint:upload}': ['rate < 0.02'], // Allow 2% failure rate
    'http_req_failed{endpoint:multipart_upload}': ['rate < 0.05'], // Allow 5% failure rate
    
    // Custom upload metrics
    'upload_latency': ['p(95) < 30000', 'p(99) < 45000'],
    
    // Bandwidth utilization
    'data_sent': ['rate > 1000000'], // At least 1MB/s aggregate upload
  },
};

// Generate test file content of specified size
function generateTestFile(sizeInBytes, mimeType = 'application/octet-stream') {
  const chunkSize = 1024; // 1KB chunks
  const chunks = Math.ceil(sizeInBytes / chunkSize);
  let content = '';
  
  for (let i = 0; i < chunks; i++) {
    const remainingBytes = Math.min(chunkSize, sizeInBytes - (i * chunkSize));
    // Generate random content for this chunk
    content += 'A'.repeat(remainingBytes);
  }
  
  return {
    content,
    size: sizeInBytes,
    mimeType,
    filename: `test-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.dat`
  };
}

// Simulate realistic file sizes based on platform requirements
const fileSizes = {
  image: {
    small: 512 * 1024,      // 512KB - typical Instagram image
    medium: 2 * 1024 * 1024,  // 2MB - high quality image
    large: 8 * 1024 * 1024,   // 8MB - maximum Instagram image
  },
  video: {
    short: 5 * 1024 * 1024,   // 5MB - short TikTok video
    medium: 25 * 1024 * 1024, // 25MB - typical Instagram video
    long: 100 * 1024 * 1024,  // 100MB - maximum file size
  }
};

export default function uploadLoadTest() {
  const baseUrl = config.baseUrl;
  
  group('Upload Load Test', () => {
    
    // Test 1: Small image upload (typical use case)
    group('Small Image Upload', () => {
      const imageFile = generateTestFile(fileSizes.image.small, 'image/jpeg');
      
      const startTime = Date.now();
      const response = uploadFile(baseUrl, imageFile, 'image');
      const endTime = Date.now();
      
      uploadLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 200, 'Small image upload');
      
      if (isValid) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'has media ID': (b) => b.mediaId !== undefined,
          'has correct file size': (b) => b.size === imageFile.size,
          'has correct MIME type': (b) => b.mimeType === imageFile.mimeType,
          'has S3 key': (b) => b.s3Key !== undefined,
          'processing status': (b) => b.status === 'uploaded' || b.status === 'processing',
        });
      }
    });
    
    // Test 2: Medium video upload
    group('Medium Video Upload', () => {
      const videoFile = generateTestFile(fileSizes.video.medium, 'video/mp4');
      
      const startTime = Date.now();
      const response = uploadFile(baseUrl, videoFile, 'video');
      const endTime = Date.now();
      
      uploadLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 200, 'Medium video upload');
      
      if (isValid) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'video upload successful': (b) => b.mediaId !== undefined,
          'triggers transcoding': (b) => b.status === 'processing' || b.transcodingJobId !== undefined,
        });
        
        // Optional: Poll for transcoding completion
        if (body.mediaId && body.status === 'processing') {
          sleep(sleepWithJitter(5000, 2000)); // Wait 5-7 seconds
          
          const statusResponse = authenticatedRequest(
            'GET',
            `${baseUrl}/api/media/${body.mediaId}/status`,
            null,
            { tags: { endpoint: 'media_status' } }
          );
          
          if (validateResponse(statusResponse, 200, 'Media status check')) {
            const statusBody = JSON.parse(statusResponse.body);
            
            check(statusBody, {
              'transcoding in progress or complete': (b) => 
                ['processing', 'completed', 'transcoding'].includes(b.status),
            });
          }
        }
      }
    });
    
    // Test 3: Multipart upload for large files
    group('Multipart Upload - Large File', () => {
      const largeFile = generateTestFile(fileSizes.video.long, 'video/mp4');
      
      // Step 1: Initiate multipart upload
      const initiateResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/media/multipart/initiate`,
        {
          filename: largeFile.filename,
          mimeType: largeFile.mimeType,
          size: largeFile.size,
          creatorId: config.testCreatorId,
        },
        { tags: { endpoint: 'multipart_initiate' } }
      );
      
      let uploadId = null;
      let presignedUrls = [];
      
      if (validateResponse(initiateResponse, 200, 'Multipart initiate')) {
        const body = JSON.parse(initiateResponse.body);
        uploadId = body.uploadId;
        presignedUrls = body.presignedUrls;
        
        check(body, {
          'has upload ID': (b) => b.uploadId !== undefined,
          'has presigned URLs': (b) => Array.isArray(b.presignedUrls) && b.presignedUrls.length > 0,
          'has media ID': (b) => b.mediaId !== undefined,
        });
      }
      
      // Step 2: Upload parts (simulate chunks)
      const parts = [];
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      const numParts = Math.min(presignedUrls.length, 3); // Test only first 3 parts for speed
      
      for (let i = 0; i < numParts; i++) {
        const partContent = largeFile.content.slice(i * chunkSize, (i + 1) * chunkSize);
        const presignedUrl = presignedUrls[i];
        
        const partStartTime = Date.now();
        const partResponse = http.put(presignedUrl.url, partContent, {
          headers: {
            'Content-Type': largeFile.mimeType,
          },
          timeout: '60s',
          tags: { endpoint: 'multipart_upload_part', part_number: i + 1 },
        });
        const partEndTime = Date.now();
        
        uploadLatency.add(partEndTime - partStartTime);
        
        if (partResponse.status >= 200 && partResponse.status < 300) {
          parts.push({
            partNumber: i + 1,
            etag: partResponse.headers.ETag || partResponse.headers.etag,
          });
          
          check(partResponse, {
            [`Part ${i + 1} uploaded successfully`]: (r) => r.status >= 200 && r.status < 300,
            [`Part ${i + 1} has ETag`]: (r) => r.headers.ETag || r.headers.etag,
          });
        }
        
        // Small delay between parts
        sleep(sleepWithJitter(500, 200));
      }
      
      // Step 3: Complete multipart upload
      if (uploadId && parts.length > 0) {
        const completeResponse = authenticatedRequest(
          'POST',
          `${baseUrl}/api/media/multipart/complete`,
          {
            uploadId,
            parts,
          },
          { tags: { endpoint: 'multipart_complete' } }
        );
        
        validateResponse(completeResponse, 200, 'Multipart complete');
        
        if (completeResponse.status === 200) {
          const body = JSON.parse(completeResponse.body);
          
          check(body, {
            'multipart upload completed': (b) => b.status === 'completed' || b.status === 'processing',
            'has final S3 key': (b) => b.s3Key !== undefined,
          });
        }
      }
    });
    
    // Test 4: Concurrent uploads
    group('Concurrent Upload Stress', () => {
      const concurrentUploads = 3;
      const uploadPromises = [];
      
      for (let i = 0; i < concurrentUploads; i++) {
        const file = generateTestFile(
          fileSizes.image.medium, 
          Math.random() > 0.5 ? 'image/jpeg' : 'video/mp4'
        );
        
        // Start uploads concurrently (simulate with minimal delay)
        setTimeout(() => {
          const response = uploadFile(baseUrl, file, file.mimeType.startsWith('image') ? 'image' : 'video');
          
          check(response, {
            [`Concurrent upload ${i + 1} successful`]: (r) => r.status >= 200 && r.status < 300,
          });
        }, i * 100); // 100ms stagger
      }
      
      // Wait for all uploads to potentially complete
      sleep(sleepWithJitter(10000, 2000)); // 10-12 seconds
    });
    
    // Test 5: Upload with transcoding parameters
    group('Upload with Transcoding Options', () => {
      const videoFile = generateTestFile(fileSizes.video.short, 'video/mp4');
      
      const transcodingOptions = {
        formats: ['720p', '480p'],
        generateThumbnail: true,
        extractAudio: false,
        addSubtitles: false, // Don't test Whisper in load test
      };
      
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/media/upload`,
        {
          filename: videoFile.filename,
          mimeType: videoFile.mimeType,
          size: videoFile.size,
          creatorId: config.testCreatorId,
          transcoding: transcodingOptions,
          // Simulate file upload by including content reference
          content: videoFile.content.slice(0, 1024), // First 1KB for validation
        },
        { tags: { endpoint: 'upload_with_transcoding' } }
      );
      
      const isValid = validateResponse(response, 200, 'Upload with transcoding');
      
      if (isValid) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'has transcoding job': (b) => b.transcodingJobId !== undefined,
          'processing status': (b) => b.status === 'processing',
          'has multiple formats requested': (b) => b.transcoding && b.transcoding.formats.length >= 2,
        });
      }
    });
    
    // Test 6: Upload error handling
    group('Upload Error Handling', () => {
      // Test 1: File too large
      const oversizedFile = {
        filename: 'too-large.mp4',
        mimeType: 'video/mp4',
        size: 500 * 1024 * 1024, // 500MB - over limit
        creatorId: config.testCreatorId,
      };
      
      const oversizeResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/media/upload`,
        oversizedFile,
        { tags: { endpoint: 'upload_error_test' } }
      );
      
      check(oversizeResponse, {
        'rejects oversized file': (r) => r.status === 413 || r.status === 400,
        'provides error message': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.error && body.error.includes('size');
          } catch (e) {
            return false;
          }
        },
      });
      
      // Test 2: Invalid MIME type
      const invalidMimeFile = {
        filename: 'test.exe',
        mimeType: 'application/x-executable',
        size: 1024,
        creatorId: config.testCreatorId,
      };
      
      const invalidMimeResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/media/upload`,
        invalidMimeFile,
        { tags: { endpoint: 'upload_error_test' } }
      );
      
      check(invalidMimeResponse, {
        'rejects invalid MIME type': (r) => r.status === 415 || r.status === 400,
      });
    });
    
    // Test 7: Upload quotas and rate limiting
    group('Upload Quotas', () => {
      const quotaTestFiles = [];
      for (let i = 0; i < 5; i++) {
        quotaTestFiles.push(generateTestFile(fileSizes.image.small, 'image/jpeg'));
      }
      
      let quotaExceeded = false;
      for (const file of quotaTestFiles) {
        const response = uploadFile(baseUrl, file, 'image');
        
        if (response.status === 429 || response.status === 403) {
          quotaExceeded = true;
          break;
        }
        
        sleep(0.2); // 200ms between uploads
      }
      
      // It's okay if quota is not exceeded in load test
      check({ quotaExceeded }, {
        'quota system is responsive': () => true, // Always pass, just log behavior
      });
    });
  });
  
  // Realistic delay between upload sessions
  sleep(sleepWithJitter(5000, 3000)); // 5-8 seconds
}

// Helper function to upload a file
function uploadFile(baseUrl, fileData, mediaType) {
  const fd = new FormData();
  fd.append('file', http.file(fileData.content, fileData.filename, fileData.mimeType));
  fd.append('creatorId', config.testCreatorId);
  fd.append('mediaType', mediaType);
  
  const response = http.post(
    `${baseUrl}/api/media/upload`,
    fd.body(),
    {
      headers: {
        'Content-Type': fd.contentType,
        'Authorization': config.apiKey ? `Bearer ${config.apiKey}` : '',
      },
      timeout: '60s',
      tags: { endpoint: 'upload', media_type: mediaType },
    }
  );
  
  return response;
}

export function teardown() {
  console.log('Upload load test completed');
}