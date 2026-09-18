// netlify/functions/sync-x.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const username = body.username.replace('@', '');
        
        // Lấy bộ đôi chìa khóa OAuth 2.0 từ Netlify
        const CLIENT_ID = process.env.X_CLIENT_ID;
        const CLIENT_SECRET = process.env.X_CLIENT_SECRET;

        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error("Hệ thống thiếu OAuth 2.0 Client ID hoặc Secret.");
        }

        // BƯỚC 1 CỦA OAUTH 2.0: ĐỔI CLIENT ID & SECRET LẤY TOKEN ĐỘNG
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

        // BƯỚC 2: DÙNG TOKEN ĐỘNG ĐỂ GỌI API LẤY ID NGƯỜI DÙNG
        const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
            headers: { 'Authorization': `Bearer ${dynamicToken}` }
        });
        const userData = await userRes.json();
        
        if (userData.errors || !userData.data) {
            throw new Error("Không tìm thấy User hoặc API bị khóa quyền Đọc (Lỗi Free Tier).");
        }
        
        const userId = userData.data.id;

        // BƯỚC 3: QUÉT BÀI ĐĂNG TÌM CASHTAG $SPHINX
        const tweetsRes = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics&exclude=retweets,replies`, {
            headers: { 'Authorization': `Bearer ${dynamicToken}` }
        });
        const tweetsData = await tweetsRes.json();

        let totalViews = 0, totalLikes = 0, totalReplies = 0, totalReposts = 0;
        let validTweetsCount = 0;
        
        if (tweetsData.data) {
            tweetsData.data.forEach(tweet => {
                if (tweet.text && tweet.text.toLowerCase().includes("$sphinx")) {
                    const metrics = tweet.public_metrics;
                    totalViews += (metrics.impression_count || 0);
                    totalLikes += (metrics.like_count || 0);
                    totalReplies += (metrics.reply_count || 0);
                    totalReposts += (metrics.retweet_count || 0);
                    validTweetsCount++;
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
