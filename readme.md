# Hotel Royal - Luxury Stay (Hotel Management System)

A full-stack, responsive web-based Hotel Management System designed for managing room reservations, customer records, stay logs, and payment histories in real-time. Built with a Node.js/Express backend and a MySQL database backend.

---

## Key Features

- **Interactive Room Overview:** View all 24 luxury rooms organized by floor, complete with dynamic availability status and real-time future booking popups.
- **Reservation Management:** Create, filter, and track customer bookings seamlessly across different room types (Standard, Deluxe, Suite).
- **Customer Directory:** Auto-saved database records for guest names, contact phone numbers, and email addresses.
- **Payment & Stay History:** Detailed table view for tracking check-in/check-out dates, rates, payment methods (UPI, Card, Cash), and payment statuses.
- **Receipt Generation:** Integrated receipt drawer with direct print functionality for completed bookings.
- **Dark Luxury Theme:** Custom CSS styling with dark green (`#204a37`), gold/bronze accents (`#c6a45b`), and responsive UI layouts.

---

## Technology Stack

- **Frontend:** HTML5, CSS3 (Custom Dark Theme + Responsive Flex/Grid), JavaScript (Fetch API, DOM manipulation)
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Database Driver:** `mysql2` (or `mysql`)

---

## Project Structure

```text
hotel-management-system/
├── public/
│   ├── index.html       # Single-page frontend dashboard & UI styles
│   └── ...              # Static assets (images, icons, etc.)
├── server.js            # Express backend & MySQL API endpoints
├── schema.sql           # Database schema & initial room setup scripts
├── package.json         # Node.js dependencies & project scripts
└── README.md            # Project documentation
```

---

## Getting Started & Installation

### 1. Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v14 or higher)
- [MySQL Server](https://www.mysql.com/) & MySQL Workbench (or CLI)

---

### 2. Database Setup

1. Open MySQL Workbench or your terminal client and create the database:
   ```sql
   CREATE DATABASE HotelReservationSystem;
   USE HotelReservationSystem;
   ```

2. Execute your schema file or create the required tables (`Room_Type`, `Room`, `Customer`, `Reservation`, `Reservation_Room`, `Payment`).

3. Populate the initial `Room_Type` and `Room` records (e.g., 24 rooms across Floor 1 to Floor 4).

> **Note:** To clear all test customer/reservation data while preserving room structure, run:
> ```sql
> SET FOREIGN_KEY_CHECKS = 0;
> TRUNCATE TABLE Payment;
> TRUNCATE TABLE Reservation_Room;
> TRUNCATE TABLE Reservation;
> TRUNCATE TABLE Customer;
> SET FOREIGN_KEY_CHECKS = 1;
> ```

---

### 3. Backend Setup

1. Clone or download this project folder into your environment.
2. Open a terminal in the root folder and install dependencies:
   ```bash
   npm install
   ```
3. Update your database configuration settings in `server.js` (or `.env` file if used):
   ```javascript
   const db = mysql.createConnection({
     host: 'localhost',
     user: 'root',
     password: 'YOUR_MYSQL_PASSWORD',
     database: 'HotelReservationSystem'
   });
   ```

---

### 4. Running the Application

1. Start the server:
   ```bash
   node server.js
   ```
2. Open your web browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## Testing the Workflow

1. Navigate to **Reservations** and enter customer details (Name, Phone, Email, Dates, Room selection).
2. Confirm the reservation and check the updated **Room Overview** dashboard.
3. Scroll down to **Customer Stay & Payment History** to update status, record payments, and view/print the official guest receipt.

---

## License

This project was built as an academic DBMS mini-project for hotel management simulation. Free to modify and build upon.