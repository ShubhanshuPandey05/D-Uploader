const express = require("express");
const multer = require("multer");
const { google } = require("googleapis");
const cors = require("cors");
const stream = require("stream");  // Import stream module
require("dotenv").config();
const path = require('path');


const app = express();
const upload = multer({
    storage: multer.memoryStorage(), // Store the image in memory for immediate processing
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
});

const PORT = process.env.PORT || 3000;

// Google Service Account Credentials
const serviceAccountCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Google Auth setup
const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountCredentials,
    scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

app.use(cors());
app.use(express.json());


app.use(express.static(path.join(__dirname)));

// Route to serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "backend", 'index.html'));
});

// Testing the server
app.get('/test', (req, res) => {
    res.send('Hello from D-Uploader server')
})

function pingServer() {
    fetch('https://fifth-season-decor-order-app.onrender.com/ping')
        .then(response => {
            if (response.ok) {
                console.log('Server is reachable');
            } else {
                console.error('Server responded with an error:', response.status);
            }
        })
        .catch(error => {
            console.error('Error pinging the server:', error);
        });

    fetch('https://formsflow.onrender.com/')
        .then(response => {
            if (response.ok) {
                console.log('Server is reachable');
            } else {
                console.error('Server responded with an error:', response.status);
            }
        })
        .catch(error => {
            console.error('Error pinging the server:', error);
        });
}

// Ping the server every 2 minute
setInterval(pingServer, 1200000);

// Upload endpoint
app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        const { invoiceNo, sheetName } = req.body;

        // Step 1: Upload the file to Google Drive
        const fileMetadata = {
            name: `invoice-${invoiceNo}.jpg`,
            parents: [process.env.DRIVE_FOLDER_ID],
        };

        // Convert Buffer to Readable Stream
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // Use the readable stream for the file upload
        const media = {
            mimeType: req.file.mimetype,  // MIME type from the uploaded file
            body: bufferStream,           // Pass the readable stream
        };

        // Upload the file to Google Drive
        const fileResponse = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: "id, webViewLink", // Fields to return from Google Drive
        });

        const fileLink = fileResponse.data.webViewLink;

        // Step 2: Find the row with the matching Invoice No in the selected sheet
        const sheetResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!X2:X`,
        });

        const rows = sheetResponse.data.values;
        let rowIndex = -1;

        if (rows) {
            rows.forEach((row, index) => {
                if (row[0] === invoiceNo) {
                    rowIndex = index + 2; // Account for header row (index + 2)
                }
            });
        }

        if (rowIndex === -1) {
            return res.status(404).json({ message: "Invoice No not found in the sheet." });
        }

        // Step 3: Update the DOCKET NO. field (column Y) with the file link
        await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SHEET_ID,
            range: `${sheetName}!Y${rowIndex}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [[fileLink]],
            },
        });

        res.json({ message: "File uploaded and sheet updated successfully!", link: fileLink });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message, message: "An error occurred while processing your request." });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
