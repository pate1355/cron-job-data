require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const crypto = require("crypto");

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
async function fetchSheetData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found from Sheets.");
      console.log("Moving to delete all existing data from Supabase...");
      console.log("Deleting all data from Supabase...");
      await deleteAllPostingFromSupabase();
      return;
    }

    // Extract headers and data
    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const job = headers.reduce((obj, key, index) => {
        obj[key] =
          key === "tags" && row[index]
            ? row[index].split(",").map((tag) => tag.trim())
            : row[index] || null;
        return obj;
      }, {});
      job.hash = generateHash(job); // Generate unique hash for each row
      return job;
    });
  } catch (error) {
    console.error("Error fetching or processing data from Sheets:", error);
    return [];
  }
}

// Generate a SHA-256 hash of the job data
function generateHash(job) {
  const jobString = JSON.stringify([
    job.job_title,
    job.company_name,
    job.job_description,
    job.job_category,
    job.job_type,
    job.offered_salary,
    job.location,
    job.tags.join(","),
    job.experience_required,
    job.education_required,
  ]);
  return crypto.createHash("sha256").update(jobString).digest("hex");
}

//  Fetch all existing records from Supabase.

async function getExistingData() {
  const { data, error } = await supabase.from("job_post_data").select("hash");

  if (error) {
    console.error("Error fetching existing data from Supabase:", error);
    return new Set();
  }

  return new Set(data.map((job) => job.hash)); // Store hashes for comparison
}

//  Filter out new records (records that are NOT in Supabase).

function filterNewRecords(sheetData, existingHashes) {
  return sheetData.filter((job) => !existingHashes.has(job.hash)); // Insert only if hash is new
}

//Insert only new records into Supabase.

// async function insertDataToSupabase(newData) {
//   if (newData.length === 0) {
//     console.log("No new data to insert.");
//     return;
//   }

//   try {
//     const batchSize = 100; // Insert in batches to avoid API limits
//     for (let i = 0; i < newData.length; i += batchSize) {
//       const batch = newData.slice(i, i + batchSize);
//       const { error } = await supabase.from("job_post_data").insert(batch);
//       if (error) throw error;
//       console.log(`Inserted batch ${i / batchSize + 1} successfully.`);
//     }
//   } catch (error) {
//     console.error("Error inserting data into Supabase:", error);
//   }
// }

async function insertDataToSupabase(newRecords) {
  if (newRecords.length === 0) {
    console.log("No new records to insert.");
    return;
  }

  const { error } = await supabase.from("job_post_data").insert(newRecords);

  if (error) {
    console.error("Error inserting data into Supabase:", error);
  } else {
    console.log(`Inserted ${newRecords.length} new records.`);
  }
}

//Main function to execute the script.

async function main() {
  console.log("Fetching data from Google Sheets...");
  const sheetData = await fetchSheetData();

  console.log("Fetching existing data from Supabase...");
  const existingData = await getExistingData();

  console.log("Filtering new records...");
  const newData = filterNewRecords(sheetData, existingData);

  console.log(`New records to insert: ${newData.length}`);
  await insertDataToSupabase(newData);
}

// Run the script
main().catch(console.error);
