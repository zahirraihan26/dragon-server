import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- HELPER WRAPPERS ---
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

const mapCurrentsData = (article, index) => ({
    _id: article.id || Buffer.from(article.url || article.title).toString('base64').slice(0, 12) + "cur" + index,
    category_id: 1,
    rating: { number: 4 + Math.random(), badge: "Currents Verified" },
    total_view: Math.floor(Math.random() * 1500) + 200,
    title: article.title,
    author: {
        name: article.author || "Currents Source",
        published_date: article.published,
        img: `https://ui-avatars.com/api/?name=${article.author?.split(' ')[0] || 'C'}`
    },
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
    author: {
        name: article.source?.name || "GNews Source",
        published_date: article.publishedAt,
        img: `https://ui-avatars.com/api/?name=${article.source?.name?.split(' ')[0] || 'G'}`
    },
    thumbnail_url: article.image || "https://images.unsplash.com/photo-1495020689067-9588ac2ed155",
    image_url: article.image || "https://images.unsplash.com/photo-1495020689067-9588ac2ed155",
    details: article.content || article.description || "",
    short_details: article.description || "",
    others: { is_today_pick: index < 1, is_trending: index % 5 === 0 },
    source_url: article.url,
    api_source: "gnews"
});

// --- NEWS PROXY ROUTE ---
app.get('/api/news/:id', async (req, res) => {
    const catId = req.params.id || "0";
    const catConfig = CATEGORY_MAP[catId] || CATEGORY_MAP["0"];

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    let combinedArticles = [];

    try {
        // Currents API
        const currentsUrl = `${process.env.VITE_CURRENTS_BASE_URL}/search?category=${catConfig.currents}&language=en&apiKey=${process.env.VITE_CURRENTS_API_KEY}`;
        const currentsRes = await axios.get(currentsUrl);
        if (currentsRes.data.status === "ok" && currentsRes.data.news) {
            combinedArticles = currentsRes.data.news.map(mapCurrentsData);
        }
    } catch (err) {
        console.warn("Currents API failed:", err.message);
    }

    try {
        // GNews API
        const gnewsUrl = `${process.env.VITE_GNEWS_BASE_URL}/top-headlines?category=${catConfig.gnews}&lang=en&apikey=${process.env.VITE_GNEWS_API_KEY}`;
        const gnewsRes = await axios.get(gnewsUrl);
        if (gnewsRes.data.articles) {
            const gArticles = gnewsRes.data.articles.map(mapGNewsData);
            combinedArticles = [...combinedArticles, ...gArticles];
        }
    } catch (err) {
        console.warn("GNews API failed:", err.message);
    }

    // De-duplicate & Sort
    const uniqueArticles = Array.from(new Map(combinedArticles.map(a => [a.title?.toLowerCase(), a])).values());
    const sorted = uniqueArticles.sort((a, b) => {
        const dateA = new Date(a.author.published_date || 0);
        const dateB = new Date(b.author.published_date || 0);
        return dateB - dateA;
    });

    // Apply Pagination
    const startIndex = (page - 1) * limit;
    const paginatedArticles = sorted.slice(startIndex, startIndex + limit);

    res.json({
        data: paginatedArticles,
        total: sorted.length,
        page,
        limit
    });
});

// --- WEATHER PROXY ROUTE ---
app.get('/api/weather', async (req, res) => {
    const { lat, lon, city } = req.query;
    let url;

    if (lat && lon) {
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.VITE_OPENWEATHER_API_KEY}&units=metric`;
    } else {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${city || 'Dhaka'}&appid=${process.env.VITE_OPENWEATHER_API_KEY}&units=metric`;
    }

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: "Weather fetch failed", message: err.message });
    }
});

app.get('/', (req, res) => res.send('Dragon News Proxy Server Active'));

app.listen(PORT, () => console.log(`Backend Neural Proxy running on port ${PORT}`));
