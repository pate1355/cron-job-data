const { google } = require("googleapis");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Decode the Base64 secret stored in GitHub Environment Secrets
const firebaseCredsBase64 = process.env.FIREBASE_CREDENTIALS;

if (!firebaseCredsBase64) {
  console.error("FIREBASE_CREDENTIALS environment variable is missing.");
  process.exit(1);
}

// Convert from Base64 to JSON
const firebaseCreds = JSON.parse(
  Buffer.from(firebaseCredsBase64, "base64").toString("utf8")
);

// Authenticate Google Sheets API using Firebase credentials
const auth = new google.auth.GoogleAuth({
  credentials: firebaseCreds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

// Initialize Firebase with decoded credentials
const app = admin.initializeApp({
  credential: admin.credential.cert(firebaseCreds),
});

// Function to save data to Firestore
const setData = async (data) => {
  try {
    const db = admin.firestore(app);
    const ref = db.collection("data").doc("sheetData"); // Consider making this dynamic
    await ref.set({ data });
    console.log("Data saved to Firestore");
  } catch (error) {
    console.error("Error saving to Firestore:", error);
  }
};

// Function to fetch and process data from Google Sheets
async function getSheetData() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  //   const spreadsheetId = "1ooPvU2eFN7t25e3HhxB1jrTizce0lXc_gfK4h8S2sWA"; // Replace with your spreadsheet ID
  //   const range = "Sheet1!A1:J51"; // Replace with your desired range
  const spreadsheetId = "1tYaBYjZi92ml1hxjgxxcy9b7vXgYWInAYn0gruCT6lA"; // Replace with your spreadsheet ID
  const range = "Sheet1!A:J"; // Adjust range as needed

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    if (!response.data.values || response.data.values.length === 0) {
      console.log("No data found.");
      return;
    }

    const [header, ...rows] = response.data.values;

    // Convert rows into JSON objects with header mapping
    let data = rows.map((row) =>
      row.reduce((acc, value, index) => {
        acc[header[index]] = value;
        return acc;
      }, {})
    );

    // Sort data by "Name" key for consistent comparison
    // data.sort((a, b) => (Number(a.ID) || "").localeCompare(Number(b.ID) || ""));
    data.map((item) => {
      item.ID = Number(item.ID);
      item.Price = Number(item.Price);
      item.Date = new Date(item.Date).toISOString();
    });

    let fileData = { data: [] };

    // Read existing file if available
    try {
      fileData = JSON.parse(fs.readFileSync("sheetData.json", "utf-8"));
    } catch (err) {
      console.warn("No existing sheetData.json found. Creating a new one.");
    }

    // Compare new data with existing file data
    const isDataEqual = JSON.stringify(data) === JSON.stringify(fileData.data);

    if (isDataEqual) {
      console.log("Data is up to date. No changes detected.");
    } else {
      console.log("Data has changed. Updating...");

      // Identify changes
      const diff = data.filter(
        (newItem) =>
          !fileData.data.some(
            (oldItem) => JSON.stringify(oldItem) === JSON.stringify(newItem)
          )
      );

      console.log("Updated rows:", diff);

      // Save new data to file
      fs.writeFileSync("sheetData.json", JSON.stringify({ data }, null, 2));
      console.log("Updated data saved to sheetData.json");

      // Save updated data to Firestore

      //save date as timestamp, ID as number, and Phone as number, and Price as number

      await setData(data);
    }
  } catch (error) {
    console.error("Error fetching or processing data:", error);
  }
}

// Run script
getSheetData();
