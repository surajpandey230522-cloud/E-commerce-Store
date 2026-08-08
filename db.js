require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function setupDatabase() {
    const db = await open({
        filename: process.env.DB_PATH || './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            price REAL NOT NULL,
            image TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            items TEXT NOT NULL,
            total REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);

    // Seed products if empty
    const productCount = await db.get('SELECT COUNT(*) as count FROM products');
    if (productCount.count === 0) {
        const insertStmt = await db.prepare(`INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)`);
        await insertStmt.run("Premium Wireless Headphones", "Experience pure sound with these noise-cancelling wireless headphones. Perfect for audiophiles and commuters alike.", 299.99, "/images/headphones.jpg");
        await insertStmt.run("Mechanical Keyboard", "Tactile, responsive, and incredibly durable. This mechanical keyboard features customizable RGB lighting.", 149.50, "/images/keyboard.jpg");
        await insertStmt.run("Ergonomic Office Chair", "Say goodbye to back pain with our top-tier ergonomic chair, designed for long hours of comfortable work.", 499.00, "/images/chair.jpg");
        await insertStmt.run("Smart Watch Series 8", "Track your fitness, receive notifications, and stay connected on the go with this sleek smartwatch.", 399.99, "/images/watch.jpg");
        await insertStmt.finalize();
        console.log("Database seeded with initial products.");
    }

    return db;
}

module.exports = { setupDatabase };
