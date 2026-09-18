// netlify/functions/sync-x.js
exports.handler = async function(event, context) {
    // 1. Chỉ chấp nhận phương thức POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const username = body.username.replace('@', ''); // Bỏ dấu @ nếu có
        
        // Lấy API Key bảo mật từ cài đặt của Netlify
        const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN; 

        if (!X_BEARER_TOKEN) {
            throw new Error("Missing X API Token in environment variables.");
        }

        // 2. Gọi API X thật (Lấy ID của user trước)
        const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
            headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` }
        });
        const userData = await userRes.json();
        
        // Bắt lỗi nếu tài khoản không tồn tại hoặc bị chặn API
        if (userData.errors || !userData.data) {
            throw new Error("User not found on X or API limits reached.");
        }
        
        const userId = userData.data.id;

        // 3. Quét các bài đăng gần nhất (Tăng max_results lên 100 để không lọt bài)
        const tweetsRes = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics&exclude=retweets,replies`, {
            headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` }
        });
        const tweetsData = await tweetsRes.json();

        // 4. Bóc tách, kiểm duyệt và cộng dồn lượt tương tác thật
        let totalViews = 0, totalLikes = 0, totalReplies = 0, totalReposts = 0;
        let validTweetsCount = 0;
        
        if (tweetsData.data) {
            tweetsData.data.forEach(tweet => {
                // KIỂM DUYỆT: Ép về chữ thường để quét, nhận diện cả $SPHINX, $Sphinx,$sphinx
                if (tweet.text && tweet.text.toLowerCase().includes("$sphinx")) {
                    const metrics = tweet.public_metrics;
                    // Dùng fallback || 0 để tránh lỗi NaN nếu API thiếu trường dữ liệu
                    totalViews += (metrics.impression_count || 0);
                    totalLikes += (metrics.like_count || 0);
                    totalReplies += (metrics.reply_count || 0);
                    totalReposts += (metrics.retweet_count || 0);
                    validTweetsCount++;
                }
            });
        }

        // 5. Trả kết quả thật về cho file index.html hiển thị
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" }, // Bổ sung Header để trình duyệt đọc chuẩn
            body: JSON.stringify({
                success: true,
                validPosts: validTweetsCount,
                metrics: { views: totalViews, likes: totalLikes, replies: totalReplies, reposts: totalReposts }
            })
        };

    } catch (error) {
        console.error("Oracle Sync Error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};