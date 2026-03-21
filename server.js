import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

// --- Simple in-memory cache ---
const newsCache = {}; // key = category_page, value = articles array
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

// --- Retry helper ---
const axiosRetry = async (url, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.get(url);
        } catch (err) {
            if (err.response?.status === 429 && i < retries - 1) {
                console.log(`429 detected, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
};

// --- CATEGORY MAP ---
const CATEGORY_MAP = {
    '0': { currents: 'general', gnews: 'general' },
    '1': { currents: 'world', gnews: 'world' },
    '2': { currents: 'business', gnews: 'business' },
    '3': { currents: 'technology', gnews: 'technology' },
    '4': { currents: 'health', gnews: 'health' },
    '5': { currents: 'sports', gnews: 'sports' },
    '6': { currents: 'entertainment', gnews: 'entertainment' },
    '7': { currents: 'science', gnews: 'science' },
    '8': { currents: 'politics', gnews: 'nation' },
    '9': { currents: 'academia', gnews: 'general' },
    '10': { currents: 'lifestyle', gnews: 'general' }
};

// --- Mapper functions (same as before) ---
const mapCurrentsData = (article, index) => ({
    _id: article.id || Buffer.from(article.url || article.title).toString('base64').slice(0, 12) + "cur" + index,
    category_id: 1,
    rating: { number: 4 + Math.random(), badge: "Currents Verified" },
    total_view: Math.floor(Math.random() * 1500) + 200,
    title: article.title,
    author: { name: article.author || "Currents Source", published_date: article.published, img: `https://ui-avatars.com/api/?name=${article.author?.split(' ')[0] || 'C'}` },
    thumbnail_url: article.image !== "None" ? article.image : "https://images.unsplash.com/photo-1504711434969-e33886168f5c",
    image_url: article.image !== "None" ? article.image : "https://images.unsplash.com/photo-1504711434969-e33886168f5c",
    details: article.description || article.content || "",
    short_details: article.description || "",
    others: { is_today_pick: index < 1, is_trending: index % 4 === 0 },
    source_url: article.url,
    api_source: "currents"
});

const mapGNewsData = (article, index) => ({
    _id: Buffer.from(article.url || article.title).toString('base64').slice(0, 12) + "gn" + index,
    category_id: 1,
    rating: { number: 4 + Math.random(), badge: "GNews Verified" },
    total_view: Math.floor(Math.random() * 2000) + 500,
    title: article.title,
    author: { name: article.source?.name || "GNews Source", published_date: article.publishedAt, img: `https://ui-avatars.com/api/?name=${article.source?.name?.split(' ')[0] || 'G'}` },
    thumbnail_url: article.image || "https://images.unsplash.com/photo-1495020689067-9588ac2ed155",
    image_url: article.image || "https://images.unsplash.com/photo-1495020689067-9588ac2ed155",
    details: article.content || article.description || "",
    short_details: article.description || "",
    others: { is_today_pick: index < 1, is_trending: index % 5 === 0 },
    source_url: article.url,
    api_source: "gnews"
});

// --- NEWS ROUTE ---
app.get('/api/news/:id', async (req, res) => {
    const catId = req.params.id || "0";
    const catConfig = CATEGORY_MAP[catId] || CATEGORY_MAP["0"];
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;

    const cacheKey = `${catId}_${page}_${limit}`;
    const now = Date.now();

    // Serve from cache if available
    if (newsCache[cacheKey] && (now - newsCache[cacheKey].timestamp < CACHE_TTL)) {
        return res.json(newsCache[cacheKey].data);
    }

    let combinedArticles = [];

    // --- Currents API ---
    try {
        const currentsUrl = `${process.env.VITE_CURRENTS_BASE_URL}/search?category=${catConfig.currents}&language=en&apiKey=${process.env.VITE_CURRENTS_API_KEY}`;
        const currentsRes = await axiosRetry(currentsUrl, 3, 1200);
        if (currentsRes.data.status === "ok" && currentsRes.data.news) {
            combinedArticles = currentsRes.data.news.map(mapCurrentsData);
        }
    } catch (err) {
        console.warn("Currents API failed:", err.message);
    }

    // --- GNews API ---
    try {
        const gnewsUrl = `${process.env.VITE_GNEWS_BASE_URL}/top-headlines?category=${catConfig.gnews}&lang=en&apikey=${process.env.VITE_GNEWS_API_KEY}`;
        const gnewsRes = await axios.get(gnewsUrl);
        if (gnewsRes.data.articles) {
            const gArticles = gnewsRes.data.articles.map(mapGNewsData);
            combinedArticles = [...combinedArticles, ...gArticles];
        }
    } catch (err) {
        console.warn("GNews API failed:", err.message);
    }

    // Deduplicate & sort
    const uniqueArticles = Array.from(new Map(combinedArticles.map(a => [a.title?.toLowerCase(), a])).values());
    const sorted = uniqueArticles.sort((a, b) => new Date(b.author.published_date) - new Date(a.author.published_date));

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedArticles = sorted.slice(startIndex, startIndex + limit);

    const response = { data: paginatedArticles, total: sorted.length, page, limit };

    // Save to cache
    newsCache[cacheKey] = { data: response, timestamp: now };

    res.json(response);
});

// --- Other routes (Weather, etc.) ---
// Same as your previous code...

app.listen(PORT, () => console.log(`Backend Neural Proxy running on port ${PORT}`));