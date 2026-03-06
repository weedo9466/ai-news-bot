require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Parser = require('rss-parser');
const parser = new Parser();

// Configure the Telegram bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
    console.error('Error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in the environment variables.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

// Tech and Rap French feeds
const FEEDS = [
    { category: '💻 Technologie', name: 'Journal du Geek', url: 'https://www.journaldugeek.com/feed/' },
    { category: '💻 Technologie', name: 'Frandroid', url: 'https://www.frandroid.com/feed' },
    { category: '💻 Technologie', name: 'Numerama', url: 'https://www.numerama.com/feed/' },
    { category: '🎤 Rap FR', name: 'Booska-P', url: 'https://www.booska-p.com/feed/' }
];

async function fetchNews() {
    let allNews = [];

    // Calculate the date 24 hours ago
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const feedConfig of FEEDS) {
        try {
            const feed = await parser.parseURL(feedConfig.url);

            feed.items.forEach(item => {
                const itemDate = new Date(item.isoDate || item.pubDate);

                // Only keep news from the last 24 hours
                if (itemDate > yesterday) {
                    allNews.push({
                        title: item.title,
                        link: item.link,
                        source: feedConfig.name,
                        category: feedConfig.category,
                        date: itemDate
                    });
                }
            });
        } catch (error) {
            console.error(`Error fetching feed from ${feedConfig.name}:`, error.message);
        }
    }

    return allNews;
}

async function sendDailyNews() {
    console.log('Fetching daily news...');
    try {
        const news = await fetchNews();

        if (news.length === 0) {
            await bot.sendMessage(chatId, '📰 <b>Aucune nouvelle actualité détectée ces dernières 24 heures.</b>', { parse_mode: 'HTML' });
            return;
        }

        // Sort by date (newest first)
        news.sort((a, b) => b.date - a.date);

        // Group by category
        const categorizedNews = {
            '💻 Technologie': news.filter(n => n.category === '💻 Technologie').slice(0, 5), // Top 5
            '🎤 Rap FR': news.filter(n => n.category === '🎤 Rap FR').slice(0, 5) // Top 5
        };

        let message = '🌅 <b>Bonjour ! Voici votre résumé quotidien Rap & Tech :</b>\n\n';

        for (const [category, items] of Object.entries(categorizedNews)) {
            if (items.length > 0) {
                message += `<b>${category}</b>\n`;
                items.forEach(item => {
                    message += `• <a href="${item.link}">${item.title}</a> (<i>${item.source}</i>)\n`;
                });
                message += '\n';
            }
        }

        console.log('Sending message to Telegram...');
        await bot.sendMessage(chatId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        console.log('Message sent successfully!');

    } catch (error) {
        console.error('An error occurred:', error);
    }
}

// Execute the function
sendDailyNews();
