const { google } = require("googleapis");
const admin = require("firebase-admin");
const fs = require("fs");
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

// Initialize Firebase Admin SDK
const app = admin.initializeApp({
  credential: admin.credential.cert(firebaseCreds),
});
const db = admin.firestore(app);

// Authenticate Google Sheets API
const auth = new google.auth.GoogleAuth({
  credentials: firebaseCreds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

// Constants
const SPREADSHEET_ID = "1tYaBYjZi92ml1hxjgxxcy9b7vXgYWInAYn0gruCT6lA";
const RANGE = "Sheet1!A:J"; // Adjust range as needed

// Function to fetch data from Google Sheets
async function getSheetData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    if (!response.data.values || response.data.values.length === 0) {
      console.log("No data found from Sheets.");
      console.log(
        "Moving to delete all existing data from SheetData File, and then Firestore..."
      );
      console.log("Deleting all data from SheetData File...");
      await deleteAllCustomersFromSheetData();
      console.log("Deleting all data from Firestore...");
      await deleteAllCustomersFromFirestore();
      return;
    }

    const [header, ...rows] = response.data.values;

    // Map rows to JSON objects
    const data = rows.map((row) =>
      row.reduce((acc, value, index) => {
        acc[header[index]] = value;
        return acc;
      }, {})
    );

    processAndSaveData(data);
  } catch (error) {
    console.error("Error fetching or processing data from Sheets:", error);
  }
}

// Function to process and save data to Firestore and file
async function processAndSaveData(data) {
  try {
    // Convert to proper data types and filter out incomplete rows
    data = data
      .map((item) => {
        let validDate = new Date(item.Date);
        return {
          ...item,
          ID: Number(item.ID) || null, // Convert ID to number, set null if invalid
          Price: Number(item.Price) || null, // Convert Price to number, set null if invalid
          Date:
            item.Date && !isNaN(validDate.getTime())
              ? validDate.toISOString()
              : null, // Ensure valid date
        };
      })
      .filter((newItem) => {
        // Check if all required headers have values
        const allValuesPresent = Object.values(newItem).every(
          (value) => value !== undefined && value !== null && value !== ""
        );

        if (!allValuesPresent) {
          console.warn(`Skipping incomplete row ${newItem.ID}`, newItem);
          return false;
        }

        return allValuesPresent;
      });

    let fileData = { data: [] };

    // Read existing file if available
    try {
      fileData = JSON.parse(fs.readFileSync("sheetData.json", "utf-8"));
    } catch (err) {
      console.warn("No existing sheetData.json found. Creating a new one.");
    }

    // Compare new data with existing data
    const isDataEqual = JSON.stringify(data) === JSON.stringify(fileData.data);
    if (isDataEqual) {
      console.log("Data is up to date. No changes detected.");
      return;
    }

    console.log("Data has changed. Identifying differences...");

    // Identify new and updated entries
    const diff = identifyChanges(fileData.data, data);
    console.log("Changes identified:", diff);

    // Save new data to sheetData.json
    fs.writeFileSync("sheetData.json", JSON.stringify({ data }, null, 2));
    console.log("Updated data saved to sheetData.json");

    // Save updated data to Firestore
    if (diff.length > 0) {
      await updateFirestoreData(diff);
    }
  } catch (error) {
    console.error("Error processing or saving data:", error);
  }
}

// Function to identify changes between old and new data
function identifyChanges(oldData, newData) {
  return newData.filter(
    (newItem) =>
      !oldData.some(
        (oldItem) => JSON.stringify(oldItem) === JSON.stringify(newItem)
      )
  );
}

// Function to save the data to Firestore (only new/updated data)
async function updateFirestoreData(diff) {
  try {
    const ref = db.collection("data").doc("sheetData");

    // Only set diff data without overwriting existing data
    await ref.set(
      {
        data: admin.firestore.FieldValue.arrayUnion(...diff),
      },
      { merge: true }
    );

    console.log("New data saved to Firestore.");
  } catch (error) {
    console.error("Error saving data to Firestore:", error);
  }
}

// Function to delete all customers from Firestore

async function deleteAllCustomersFromFirestore() {
  try {
    const snapshot = await db.collection("data").doc("sheetData").get();

    if (!snapshot.exists) {
      console.log("No data in Firestore to delete.");
      return;
    }

    const data = snapshot.data().data;
    if (data.length === 0) {
      console.log("Firestore data is already empty.");
      return;
    }

    await db.collection("data").doc("sheetData").set({ data: [] });
    console.log("All data deleted from Firestore.");
  } catch (error) {
    console.error("Error deleting data from Firestore:", error);
  }
}

async function deleteAllCustomersFromSheetData() {
  try {
    fs.writeFileSync("sheetData.json", JSON.stringify({ data: [] }, null, 2));
    console.log("All data deleted from sheetData.json.");
  } catch (error) {
    console.error("Error deleting data from sheetData.json:", error);
  }
}

// Run the script
getSheetData();
