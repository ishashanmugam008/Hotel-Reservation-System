require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get('/', (req, res) => {
    res.send('Hotel Reservation System Backend is running!');
});

app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DATABASE() AS database_name'
        );

        res.json({
            status: 'success',
            message: 'Backend and MySQL are connected!',
            database: rows[0].database_name
        });
    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            status: 'error',
            message: 'Database connection failed'
        });
    }
});

app.get('/api/rooms', async (req, res) => {
    try {
        const [rooms] = await db.query(`
            SELECT
                r.room_id,
                r.room_number,
                r.floor_number,
                r.room_status,
                rt.type_name AS room_type,
                rt.standard_rate,
                rt.max_occupancy,
                rt.number_of_beds
            FROM Room r
            JOIN Room_Type rt
                ON r.room_type_id = rt.room_type_id
            ORDER BY r.floor_number, r.room_number
        `);

        res.json({
            status: 'success',
            total: rooms.length,
            rooms: rooms
        });
    } catch (error) {
        console.error('Error fetching rooms:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve rooms'
        });
    }
});

// NEW ROUTE: Get future reservations for a specific room
app.get('/api/rooms/:roomId/future-reservations', async (req, res) => {
    try {
        const roomId = Number(req.params.roomId);

        if (!Number.isInteger(roomId) || roomId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid room ID'
            });
        }

        const [reservations] = await db.query(`
            SELECT
                r.reservation_id,
                r.customer_id,
                c.customer_name,
                r.check_in_date,
                r.check_out_date,
                r.reservation_status
            FROM Reservation r
            JOIN Reservation_Room rr
                ON r.reservation_id = rr.reservation_id
            JOIN Customer c
                ON r.customer_id = c.customer_id
            WHERE rr.room_id = ?
              AND r.check_out_date >= CURRENT_DATE()
              AND r.reservation_status IN ('Booked', 'Checked In')
            ORDER BY r.check_in_date ASC
        `, [roomId]);

        res.json({
            status: 'success',
            room_id: roomId,
            reservations
        });

    } catch (error) {
        console.error('Error fetching future reservations:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve future room reservations'
        });
    }
});

app.get('/api/rooms/availability', async (req, res) => {
    try {
        const { checkIn, checkOut } = req.query;

        if (!checkIn || !checkOut) {
            return res.status(400).json({
                status: 'error',
                message: 'Check-in and check-out dates are required'
            });
        }

        const datePattern = /^\d{4}-\d{2}-\d{2}$/;

        if (!datePattern.test(checkIn) || !datePattern.test(checkOut)) {
            return res.status(400).json({
                status: 'error',
                message: 'Dates must use YYYY-MM-DD format'
            });
        }

        const validDate = (date) => {
            const d = new Date(date + 'T00:00:00Z');
            return !Number.isNaN(d.getTime()) &&
                d.toISOString().slice(0, 10) === date;
        };

        if (!validDate(checkIn) || !validDate(checkOut) ||
            checkOut <= checkIn) {
            return res.status(400).json({
                status: 'error',
                message: 'Please enter valid dates. Check-out must be after check-in.'
            });
        }

        const [rooms] = await db.query(`
            SELECT
                r.room_id,
                r.room_number,
                r.floor_number,
                r.room_status,
                rt.type_name AS room_type,
                rt.standard_rate,
                rt.max_occupancy,
                rt.number_of_beds,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM Reservation_Room rr
                        JOIN Reservation b
                            ON b.reservation_id = rr.reservation_id
                        WHERE rr.room_id = r.room_id
                          AND b.reservation_status IN ('Booked', 'Checked In')
                          AND b.check_in_date < ?
                          AND b.check_out_date > ?
                    )
                    OR LOWER(r.room_status) IN ('maintenance', 'cleaning')
                    THEN 0
                    ELSE 1
                END AS is_available
            FROM Room r
            JOIN Room_Type rt
                ON r.room_type_id = rt.room_type_id
            ORDER BY r.floor_number, r.room_number
        `, [checkOut, checkIn]);

        res.json({
            status: 'success',
            checkIn,
            checkOut,
            total: rooms.length,
            available: rooms.filter(room => room.is_available === 1).length,
            rooms
        });

    } catch (error) {
        console.error('Availability error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to check room availability'
        });
    }
});

app.get('/api/customers', async (req, res) => {
    try {
        const [customers] = await db.query(`
            SELECT
                customer_id,
                customer_name,
                phone,
                email,
                address
            FROM Customer
            ORDER BY customer_id DESC
        `);

        res.json({
            status: 'success',
            total: customers.length,
            customers
        });

    } catch (error) {
        console.error('Error fetching customers:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve customers'
        });
    }
});


app.post('/api/customers', async (req, res) => {
    try {
        const { customer_name, phone, email, address } = req.body;

        if (!customer_name || !phone || !address) {
            return res.status(400).json({
                status: 'error',
                message: 'Name, phone, and address are required'
            });
        }

        const cleanName = customer_name.trim();
        const cleanPhone = phone.trim();
        const cleanEmail = email ? email.trim() : null;
        const cleanAddress = address.trim();
        
        if (cleanName.length < 2) {
            return res.status(400).json({
                status: 'error',
                message: 'Customer name must contain at least 2 characters'
            });
        }

        if (!/^[0-9]{10}$/.test(cleanPhone)) {
            return res.status(400).json({
                status: 'error',
                message: 'Phone number must contain exactly 10 digits'
            });
        }

        if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                status: 'error',
                message: 'Please enter a valid email address'
            });
        }

        let [customers] = await db.execute(
            `SELECT customer_id
             FROM Customer
             WHERE phone = ?
                OR (? IS NOT NULL AND email = ?)
             LIMIT 1`,
            [cleanPhone, cleanEmail, cleanEmail]
        );

        if (customers.length > 0) {
            return res.status(200).json({
                status: 'success',
                message: 'Existing customer found',
                customer_id: customers[0].customer_id,
                existing_customer: true
            });
        }

        const [result] = await db.execute(
            `INSERT INTO Customer
             (customer_name, phone, email, address)
             VALUES (?, ?, ?, ?)`,
            [cleanName, cleanPhone, cleanEmail, cleanAddress]
        );

        res.status(201).json({
            status: 'success',
            message: 'Customer added successfully!',
            customer_id: result.insertId,
            existing_customer: false
        });

    } catch (error) {
        console.error('Error adding customer:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to add customer'
        });
    }
});


app.post('/api/reservations', async (req, res) => {
    const { customer_id, room_id, check_in_date, check_out_date } = req.body;

    if (!customer_id || !room_id || !check_in_date || !check_out_date) {
        return res.status(400).json({
            status: 'error',
            message: 'Customer, room, check-in, and check-out are required'
        });
    }

    const validDate = (date) => {
        if (typeof date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return false;
        }

        const d = new Date(date + 'T00:00:00Z');
        return !Number.isNaN(d.getTime()) &&
            d.toISOString().slice(0, 10) === date;
    };

    if (!validDate(check_in_date) || !validDate(check_out_date) ||
        check_out_date <= check_in_date) {
        return res.status(400).json({
            status: 'error',
            message: 'Enter valid dates. Check-out must be after check-in.'
        });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (check_in_date < today) {
        return res.status(400).json({
            status: 'error',
            message: 'Check-in date cannot be in the past.'
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [customers] = await connection.execute(
            'SELECT customer_id FROM Customer WHERE customer_id = ?',
            [customer_id]
        );

        if (customers.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Customer not found'
            });
        }

        const [rooms] = await connection.execute(`
            SELECT r.room_id, r.room_status, rt.standard_rate
            FROM Room r
            JOIN Room_Type rt ON r.room_type_id = rt.room_type_id
            WHERE r.room_id = ?
            FOR UPDATE
        `, [room_id]);

        if (rooms.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Room not found'
            });
        }

        if (['maintenance', 'cleaning'].includes(
            String(rooms[0].room_status).toLowerCase()
        )) {
            await connection.rollback();
            return res.status(409).json({
                status: 'error',
                message: 'This room is not available for booking'
            });
        }

        const [conflicts] = await connection.execute(`
            SELECT rr.reservation_id
            FROM Reservation_Room rr
            JOIN Reservation r
                ON r.reservation_id = rr.reservation_id
            WHERE rr.room_id = ?
              AND r.reservation_status IN ('Booked', 'Checked In')
              AND r.check_in_date < ?
              AND r.check_out_date > ?
            LIMIT 1
        `, [room_id, check_out_date, check_in_date]);

        if (conflicts.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                status: 'error',
                message: 'This room is already booked for the selected dates'
            });
        }

        const [reservation] = await connection.execute(`
            INSERT INTO Reservation
                (customer_id, booking_date, check_in_date,
                 check_out_date, reservation_status)
            VALUES (?, CURRENT_DATE(), ?, ?, 'Booked')
        `, [customer_id, check_in_date, check_out_date]);

        await connection.execute(`
            INSERT INTO Reservation_Room
                (reservation_id, room_id, booked_rate)
            VALUES (?, ?, ?)
        `, [
            reservation.insertId,
            room_id,
            rooms[0].standard_rate
        ]);

        await connection.commit();

        res.status(201).json({
            status: 'success',
            message: 'Reservation created successfully',
            reservation_id: reservation.insertId,
            customer_id: Number(customer_id),
            room_id: Number(room_id),
            check_in_date,
            check_out_date,
            booked_rate: rooms[0].standard_rate
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Reservation error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to create reservation'
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});


app.get('/api/customer-history', async (req, res) => {
    try {
        const [history] = await db.query(`
            SELECT
                c.customer_id,
                c.customer_name,
                c.phone,
                c.email,
                c.address,

                r.reservation_id,
                r.booking_date,
                r.check_in_date,
                r.check_out_date,
                r.reservation_status,

                rm.room_id,
                rm.room_number,
                rt.type_name AS room_type,
                rr.booked_rate,

                p.payment_id,
                p.amount AS payment_amount,
                p.payment_method,
                p.payment_date,
                p.payment_status,

                COALESCE((
                    SELECT SUM(
                        rr2.booked_rate *
                        GREATEST(
                            DATEDIFF(r.check_out_date, r.check_in_date),
                            0
                        )
                    )
                    FROM Reservation_Room rr2
                    WHERE rr2.reservation_id = r.reservation_id
                ), 0) AS room_booking_cost,

                COALESCE((
                    SELECT SUM(ac.amount)
                    FROM Additional_Charge ac
                    WHERE ac.reservation_id = r.reservation_id
                ), 0) AS total_additional_charges,

                COALESCE((
                    SELECT SUM(p2.amount)
                    FROM Payment p2
                    WHERE p2.reservation_id = r.reservation_id
                      AND p2.payment_status = 'Completed'
                ), 0) AS total_completed_payments,

                GREATEST(
                    COALESCE((
                        SELECT SUM(
                            rr3.booked_rate *
                            GREATEST(
                                DATEDIFF(
                                    r.check_out_date,
                                    r.check_in_date
                                ),
                                0
                            )
                        )
                        FROM Reservation_Room rr3
                        WHERE rr3.reservation_id = r.reservation_id
                    ), 0)
                    +
                    COALESCE((
                        SELECT SUM(ac2.amount)
                        FROM Additional_Charge ac2
                        WHERE ac2.reservation_id = r.reservation_id
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM(p3.amount)
                        FROM Payment p3
                        WHERE p3.reservation_id = r.reservation_id
                          AND p3.payment_status = 'Completed'
                    ), 0),
                    0
                ) AS balance_due

            FROM Customer c

            LEFT JOIN Reservation r
                ON c.customer_id = r.customer_id

            LEFT JOIN Reservation_Room rr
                ON r.reservation_id = rr.reservation_id

            LEFT JOIN Room rm
                ON rr.room_id = rm.room_id

            LEFT JOIN Room_Type rt
                ON rm.room_type_id = rt.room_type_id

            LEFT JOIN Payment p
                ON r.reservation_id = p.reservation_id

            ORDER BY
                c.customer_id DESC,
                r.reservation_id DESC,
                p.payment_id DESC
        `);

        res.json({
            status: 'success',
            totalRecords: history.length,
            history
        });

    } catch (error) {
        console.error(
            'Customer history error:',
            error.message
        );

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve customer history'
        });
    }
});

app.post('/api/payments', async (req, res) => {
    try {
        const {
            reservation_id,
            amount,
            payment_method,
            payment_status
        } = req.body;

        if (
            !reservation_id ||
            amount === undefined ||
            amount === null ||
            !payment_method
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Reservation ID, amount, and payment method are required'
            });
        }

        const paymentAmount = Number(amount);
        const allowedMethods = ['Cash', 'Card', 'UPI'];
        const allowedStatuses = ['Pending', 'Completed', 'Failed'];

        if (!Number.isInteger(Number(reservation_id)) ||
            Number(reservation_id) <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid reservation ID'
            });
        }

        if (!Number.isFinite(paymentAmount) ||
            paymentAmount <= 0 ||
            !/^\d+(\.\d{1,2})?$/.test(String(amount)) ||
            paymentAmount > 99999999.99) {
            return res.status(400).json({
                status: 'error',
                message: 'Enter a valid positive payment amount with at most two decimal places'
            });
        }

        if (!allowedMethods.includes(payment_method)) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment method must be Cash, Card, or UPI'
            });
        }

        const status = payment_status || 'Pending';

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment status must be Pending, Completed, or Failed'
            });
        }

        const [reservations] = await db.execute(
            'SELECT reservation_id FROM Reservation WHERE reservation_id = ?',
            [Number(reservation_id)]
        );

        if (reservations.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Reservation not found'
            });
        }

        const [result] = await db.execute(
            `INSERT INTO Payment
                (reservation_id, amount, payment_method, payment_date, payment_status)
             VALUES (?, ?, ?, CURRENT_DATE(), ?)`,
            [Number(reservation_id), paymentAmount, payment_method, status]
        );

        res.status(201).json({
            status: 'success',
            message: 'Payment recorded successfully',
            payment_id: result.insertId,
            reservation_id: Number(reservation_id),
            amount: paymentAmount,
            payment_method,
            payment_status: status
        });

    } catch (error) {
        console.error('Payment error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to record payment'
        });
    }
});

app.patch('/api/payments/:paymentId/status', async (req, res) => {
    try {
        const paymentId = Number(req.params.paymentId);
        const { payment_status } = req.body;

        const allowedStatuses = ['Pending', 'Completed', 'Failed'];

        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid payment ID'
            });
        }

        if (!allowedStatuses.includes(payment_status)) {
            return res.status(400).json({
                status: 'error',
                message: 'Status must be Pending, Completed, or Failed'
            });
        }

        const [result] = await db.execute(
            'UPDATE Payment SET payment_status = ? WHERE payment_id = ?',
            [payment_status, paymentId]
        );

        if (result.affectedRows === 0) {
            const [payments] = await db.execute(
                'SELECT payment_id FROM Payment WHERE payment_id = ?',
                [paymentId]
            );

            if (payments.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Payment not found'
                });
            }
        }

        res.json({
            status: 'success',
            message: 'Payment status updated successfully',
            payment_id: paymentId,
            payment_status
        });

    } catch (error) {
        console.error('Payment status update error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to update payment status'
        });
    }
});

app.patch('/api/reservations/:reservationId/cancel', async (req, res) => {
    try {
        const reservationId = Number(req.params.reservationId);

        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid reservation ID'
            });
        }

        const [reservations] = await db.execute(
            'SELECT reservation_status FROM Reservation WHERE reservation_id = ?',
            [reservationId]
        );

        if (reservations.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Reservation not found'
            });
        }

        if (reservations[0].reservation_status === 'Cancelled') {
            return res.status(409).json({
                status: 'error',
                message: 'This reservation is already cancelled'
            });
        }

        if (['Checked In', 'Checked Out'].includes(
            reservations[0].reservation_status
        )) {
            return res.status(409).json({
                status: 'error',
                message: 'A checked-in or checked-out reservation cannot be cancelled'
            });
        }

        await db.execute(
            "UPDATE Reservation SET reservation_status = 'Cancelled' WHERE reservation_id = ?",
            [reservationId]
        );

        res.json({
            status: 'success',
            message: 'Reservation cancelled successfully',
            reservation_id: reservationId
        });

    } catch (error) {
        console.error('Cancellation error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to cancel reservation'
        });
    }
});

app.post('/api/additional-charges', async (req, res) => {
    try {
        const { reservation_id, charge_type, amount, description } = req.body;

        const reservationId = Number(reservation_id);
        const chargeAmount = Number(amount);

        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid reservation ID is required'
            });
        }

        if (!charge_type || !charge_type.trim()) {
            return res.status(400).json({
                status: 'error',
                message: 'Charge type is required'
            });
        }

        if (charge_type.trim().length > 50) {
            return res.status(400).json({
                status: 'error',
                message: 'Charge type cannot exceed 50 characters'
            });
        }

        if (amount === undefined || amount === null || amount === '' ||
            !Number.isFinite(chargeAmount) || chargeAmount < 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Enter a valid non-negative charge amount'
            });
        }

        if (description && description.length > 200) {
            return res.status(400).json({
                status: 'error',
                message: 'Description cannot exceed 200 characters'
            });
        }

        const [reservations] = await db.execute(
            'SELECT reservation_id FROM Reservation WHERE reservation_id = ?',
            [reservationId]
        );

        if (reservations.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Reservation not found'
            });
        }

        const [result] = await db.execute(
            `INSERT INTO additional_charge
             (reservation_id, charge_type, amount, description)
             VALUES (?, ?, ?, ?)`,
            [
                reservationId,
                charge_type.trim(),
                chargeAmount,
                description?.trim() || null
            ]
        );

        res.status(201).json({
            status: 'success',
            message: 'Additional charge saved successfully',
            charge_id: result.insertId,
            reservation_id: reservationId,
            charge_type: charge_type.trim(),
            amount: chargeAmount,
            description: description?.trim() || null
        });

    } catch (error) {
        console.error('Add charge error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to save additional charge'
        });
    }
});


app.get('/api/additional-charges/:reservationId', async (req, res) => {
    try {
        const reservationId = Number(req.params.reservationId);

        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid reservation ID'
            });
        }

        const [reservations] = await db.execute(
            'SELECT reservation_id FROM Reservation WHERE reservation_id = ?',
            [reservationId]
        );

        if (reservations.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Reservation not found'
            });
        }

        const [charges] = await db.execute(
            `SELECT charge_id, reservation_id, charge_type,
                    amount, description
             FROM additional_charge
             WHERE reservation_id = ?
             ORDER BY charge_id DESC`,
            [reservationId]
        );

        const total = charges.reduce(
            (sum, charge) => sum + Number(charge.amount),
            0
        );

        res.json({
            status: 'success',
            reservation_id: reservationId,
            charges,
            total_additional_charges: Number(total.toFixed(2))
        });

    } catch (error) {
        console.error('Get charges error:', error.message);

        res.status(500).json({
            status: 'error',
            message: 'Unable to retrieve additional charges'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});