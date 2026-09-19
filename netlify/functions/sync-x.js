// netlify/functions/sync-x.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const username = body.username.replace('@', '');
        
        const CLIENT_ID = process.env.X_CLIENT_ID;
        const CLIENT_SECRET = process.env.X_CLIENT_SECRET;

        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error("Hệ thống thiếu OAuth 2.0 Client ID hoặc Secret.");
        }

        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const tokenResponse = await fetch('https://api.twitter.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: 'grant_type=client_credentials'
        });
        
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error("OAuth 2.0 Từ chối: Không thể tạo Access Token.");
        }
        
        const dynamicToken = tokenData.access_token;

        const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
            headers: { 'Authorization': `Bearer ${dynamicToken}` }
        });
        const userData = await userRes.json();
        
        if (userData.errors || !userData.data) {
            throw new Error("Không tìm thấy User hoặc API bị khóa quyền.");
        }
        
        const userId = userData.data.id;

        // ĐÃ SỬA: Thêm "created_at" vào tweet.fields để lấy thời gian đăng bài
        const tweetsRes = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics,created_at&exclude=retweets,replies`, {
            headers: { 'Authorization': `Bearer ${dynamicToken}` }
        });
        const tweetsData = await tweetsRes.json();

        let totalViews = 0, totalLikes = 0, totalReplies = 0, totalReposts = 0;
        let validTweetsCount = 0;
        
        const now = new Date().getTime();
        const MAX_AGE_MS = 30 * 60 * 60 * 1000; // 30 tiếng tính bằng mili-giây

        if (tweetsData.data) {
            tweetsData.data.forEach(tweet => {
                // ĐÃ SỬA: Lọc chữ $sphinx và lọc thời gian 30 tiếng
                if (tweet.text && tweet.text.toLowerCase().includes("$sphinx")) {
                    const tweetTime = new Date(tweet.created_at).getTime();
                    const age = now - tweetTime;
                    
                    // Nếu bài đăng nhỏ hơn hoặc bằng 30 tiếng mới tính điểm
                    if (age <= MAX_AGE_MS) {
                        const metrics = tweet.public_metrics;
                        totalViews += (metrics.impression_count || 0);
                        totalLikes += (metrics.like_count || 0);
                        totalReplies += (metrics.reply_count || 0);
                        totalReposts += (metrics.retweet_count || 0);
                        validTweetsCount++;
                    }
                }
            });
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                success: true,
                validPosts: validTweetsCount,
                metrics: { views: totalViews, likes: totalLikes, replies: totalReplies, reposts: totalReposts }
            })
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};
