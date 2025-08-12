#!/usr/bin/env python3

from flask import Flask, request, jsonify
import praw
from prawcore.exceptions import ResponseException, RequestException
import os
import time
from functools import wraps
import logging
from datetime import datetime

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Service authentication
SERVICE_KEY = os.environ.get('REDDIT_SERVICE_KEY', 'dev-key')

def require_service_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        key = request.headers.get('X-Service-Key')
        if key != SERVICE_KEY:
            return jsonify({'error': 'Invalid service key'}), 401
        return f(*args, **kwargs)
    return decorated_function

def get_reddit_instance(access_token):
    """Create Reddit instance with user token"""
    # PRAW configuration for OAuth
    # https://praw.readthedocs.io/en/stable/tutorials/refresh_token.html
    return praw.Reddit(
        client_id=os.environ['REDDIT_CLIENT_ID'],
        client_secret=os.environ['REDDIT_CLIENT_SECRET'],
        user_agent='OFM-Social-OS/1.0',
        refresh_token=access_token  # Using refresh token for long-lived access
    )

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/publish', methods=['POST'])
@require_service_key
def publish():
    """Publish to Reddit with rate limit awareness"""
    try:
        data = request.json
        access_token = data.get('accessToken')
        subreddit_name = data.get('subreddit')
        title = data.get('title')
        url = data.get('url')
        text = data.get('text')
        
        if not all([access_token, subreddit_name, title]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        reddit = get_reddit_instance(access_token)
        
        # Get subreddit
        subreddit = reddit.subreddit(subreddit_name)
        
        # Check rate limits before posting
        # Reddit rate limit: 100 requests per minute per OAuth client
        # https://support.reddithelp.com/hc/en-us/articles/16160319875092
        rate_limit_remaining = int(reddit.auth.limits.get('remaining', 100))
        rate_limit_reset = int(reddit.auth.limits.get('reset', 0))
        
        if rate_limit_remaining < 5:
            wait_time = max(0, rate_limit_reset - time.time())
            logger.warning(f"Rate limit low: {rate_limit_remaining} remaining. Reset in {wait_time}s")
            
            if rate_limit_remaining == 0:
                return jsonify({
                    'error': 'Rate limited',
                    'retry_after': wait_time
                }), 429
        
        # Submit post
        if url:
            # Link post
            submission = subreddit.submit(
                title=title,
                url=url,
                send_replies=True
            )
        else:
            # Text post
            submission = subreddit.submit(
                title=title,
                selftext=text or '',
                send_replies=True
            )
        
        logger.info(f"Successfully posted to r/{subreddit_name}: {submission.id}")
        
        # Return post details with rate limit info
        return jsonify({
            'id': submission.id,
            'url': f"https://reddit.com{submission.permalink}",
            'subreddit': subreddit_name,
            'created_utc': submission.created_utc,
            'rate_limit': {
                'remaining': reddit.auth.limits.get('remaining', 100),
                'reset': reddit.auth.limits.get('reset', 0)
            }
        }), 200
        
    except ResponseException as e:
        logger.error(f"Reddit API error: {e}")
        
        if e.response.status_code == 429:
            retry_after = int(e.response.headers.get('X-Ratelimit-Reset', 60))
            return jsonify({
                'error': 'Rate limited by Reddit',
                'retry_after': retry_after
            }), 429
        elif e.response.status_code == 403:
            return jsonify({
                'error': 'Forbidden - check subreddit permissions and karma requirements'
            }), 403
        else:
            return jsonify({
                'error': f"Reddit API error: {str(e)}"
            }), e.response.status_code
            
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/comment', methods=['POST'])
@require_service_key
def comment():
    """Reply to a comment or submission"""
    try:
        data = request.json
        access_token = data.get('accessToken')
        parent_id = data.get('parentId')  # Can be submission or comment ID
        body = data.get('body')
        
        if not all([access_token, parent_id, body]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        reddit = get_reddit_instance(access_token)
        
        # Get parent (submission or comment)
        if parent_id.startswith('t3_'):
            # It's a submission
            parent = reddit.submission(id=parent_id[3:])
        elif parent_id.startswith('t1_'):
            # It's a comment
            parent = reddit.comment(id=parent_id[3:])
        else:
            # Try as submission ID
            parent = reddit.submission(id=parent_id)
        
        # Reply
        comment = parent.reply(body)
        
        logger.info(f"Successfully commented: {comment.id}")
        
        return jsonify({
            'id': comment.id,
            'url': f"https://reddit.com{comment.permalink}",
            'created_utc': comment.created_utc
        }), 200
        
    except Exception as e:
        logger.error(f"Comment error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/crosspost', methods=['POST'])
@require_service_key
def crosspost():
    """Crosspost to another subreddit"""
    try:
        data = request.json
        access_token = data.get('accessToken')
        submission_id = data.get('submissionId')
        target_subreddit = data.get('targetSubreddit')
        title = data.get('title')
        
        if not all([access_token, submission_id, target_subreddit]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        reddit = get_reddit_instance(access_token)
        
        # Get original submission
        submission = reddit.submission(id=submission_id)
        
        # Crosspost
        crosspost = submission.crosspost(
            subreddit=target_subreddit,
            title=title or submission.title,
            send_replies=True
        )
        
        logger.info(f"Successfully crossposted to r/{target_subreddit}: {crosspost.id}")
        
        return jsonify({
            'id': crosspost.id,
            'url': f"https://reddit.com{crosspost.permalink}",
            'subreddit': target_subreddit,
            'created_utc': crosspost.created_utc
        }), 200
        
    except Exception as e:
        logger.error(f"Crosspost error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/metrics/<submission_id>', methods=['GET'])
@require_service_key
def get_metrics(submission_id):
    """Get post metrics"""
    try:
        access_token = request.headers.get('X-Access-Token')
        if not access_token:
            return jsonify({'error': 'Missing access token'}), 400
        
        reddit = get_reddit_instance(access_token)
        submission = reddit.submission(id=submission_id)
        
        # Force refresh to get latest data
        submission._fetch()
        
        return jsonify({
            'id': submission.id,
            'score': submission.score,
            'upvote_ratio': submission.upvote_ratio,
            'num_comments': submission.num_comments,
            'created_utc': submission.created_utc,
            'is_video': submission.is_video,
            'view_count': getattr(submission, 'view_count', None),
            'subreddit': submission.subreddit.display_name,
            'author': str(submission.author) if submission.author else '[deleted]'
        }), 200
        
    except Exception as e:
        logger.error(f"Metrics error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)