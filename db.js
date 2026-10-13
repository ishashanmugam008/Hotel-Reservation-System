
require('dotenv').config();

const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT)
});

connection.connect((err) => {
    if (err) {
        console.log('Database connection failed:', err.message);
        return;
    }

    console.log('Connected to MySQL successfully!');

    connection.query(
        'SELECT DATABASE() AS database_name',
        (err, results) => {
            if (err) {
                console.log('Query failed:', err.message);
            } else {
                console.log('Database:', results[0].database_name);
            }

            connection.end();
        }
    );
});
