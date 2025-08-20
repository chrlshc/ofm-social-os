// Simplified version of publishToSocial for build
export async function publishToSocial(params: {
  user_id: number;
  platform: string;
  caption: string;
  media_url?: string;
  platform_specific?: any;
}) {
  // TODO: Implement actual publishing logic
  console.log('Publishing to social:', params);
  
  return {
    external_id: 'test-' + Date.now(),
    external_url: 'https://example.com/post/' + Date.now()
  };
}