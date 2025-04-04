require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const _ = require("lodash");
dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Decode Base64 Firebase Credentials
const firebaseCredsBase64 = process.env.FIREBASE_CREDENTIALS;
if (!firebaseCredsBase64) {
  console.error("FIREBASE_CREDENTIALS environment variable is missing.");
  process.exit(1);
}

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
const RANGE = "Sheet1!A:M"; // Adjust range as needed

// Function to fetch data from Google Sheets
async function fetchSheetData() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log("No data found in Sheets. Skipping sync...");
      return [];
    }

    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const job = headers.reduce((obj, key, index) => {
        obj[key] =
          key === "tags" && row[index]
            ? row[index].split(",").map((tag) => tag.trim())
            : row[index] || null;

        if (key === "count") {
          // Convert count to integer8
          obj[key] = Number(obj[key]);
        }

        if (key === "offered_salary") {
          obj[key] = Number(obj[key]);
        }

        return obj;
      }, {});

      return job;
    });
  } catch (error) {
    console.error("Error fetching or processing data from Sheets:", error);
    return [];
  }
}

// Fetch all existing records from Supabase
async function getExistingData() {
  const { data, error } = await supabase
    .from("job_post_data")
    .select(
      "id, job_title, company_name, location, job_type, job_description, tags, job_category, offered_salary, experience_required, education_required, count"
    );

  if (error) {
    console.error("Error fetching existing data from Supabase:", error);
    return [];
  }

  return data;
}

// Function to identify new records and changed records
async function identifyChanges(existingData, sheetData) {
  const notExist = [];
  const toUpdate = [];
  const toDelete = [];

  sheetData.forEach((element) => {
    const existingItem = existingData.find(
      (existingItem) => existingItem.id === element.id
    );

    if (!existingItem) {
      notExist.push(element);
    } else {
      const fieldsToCheck = [
        "job_title",
        "company_name",
        "job_description",
        "job_category",
        "job_type",
        "offered_salary",
        "location",
        "tags",
        "experience_required",
        "education_required",
        "count",
        "Company_Link",
      ];
      const updatedFields = fieldsToCheck.reduce((acc, field) => {
        if (!_.isEqual(element[field], existingItem[field])) {
          console.log(
            `Field ${field} has changed from ${existingItem[field]} to ${element[field]}`
          );
          acc[field] = element[field];
        }
        return acc;
      }, {});
      if (Object.keys(updatedFields).length > 0) {
        toUpdate.push({ id: existingItem.id, ...updatedFields });
      }
    }
  });

  // Identify records that exist in Supabase but are missing from Google Sheets
  existingData.forEach((existingItem) => {
    const existsInSheet = sheetData.some((item) => item.id === existingItem.id);
    if (!existsInSheet) {
      toDelete.push(existingItem.id);
    }
  });

  await insertNewRecords(notExist);
  await updateExistingRecords(toUpdate);
  await deleteRecords(toDelete);
}

// Function to delete records that no longer exist in Google Sheets
async function deleteRecords(ids) {
  if (ids.length === 0) {
    console.log("No records to delete.");
    return;
  }

  try {
    const { error } = await supabase
      .from("job_post_data")
      .delete()
      .in("id", ids);
    if (error) {
      console.error("Error deleting records:", error);
    } else {
      console.log(`Deleted ${ids.length} records.`);
    }
  } catch (error) {
    console.error("Error during delete operation:", error);
  }
}

// Function to insert new records
async function insertNewRecords(records) {
  if (records.length === 0) {
    console.log("No records to insert.");
    return;
  }

  try {
    const { error } = await supabase.from("job_post_data").insert(records);
    if (error) {
      console.error("Error inserting new records:", error);
    } else {
      console.log(`Inserted ${records.length} new records.`);
    }
  } catch (error) {
    console.error("Error during insert operation:", error);
  }
}

// Function to update existing records with only changed fields
async function updateExistingRecords(records) {
  if (records.length === 0) {
    console.log("No records to update.");
    return;
  }

  try {
    const updates = records.map(async (record) => {
      const { id, ...updatedFields } = record;
      const { error } = await supabase
        .from("job_post_data")
        .update(updatedFields)
        .eq("id", id);

      if (error) {
        console.error(`Error updating record ID ${id}:`, error);
      }
    });

    await Promise.all(updates);
    console.log(`Updated ${records.length} records.`);
  } catch (error) {
    console.error("Error during update operation:", error);
  }
}

// Main function to execute the script
async function main() {
  console.log("Starting job sync process...");
  const startTime = Date.now(); // Start tracking execution time

  console.log("Fetching data from Google Sheets...");
  const sheetData = await fetchSheetData();

  if (sheetData.length === 0) {
    console.log("No data to process.");
    return;
  }

  console.log("Fetching existing data from Supabase...");
  const existingData = await getExistingData();

  console.log("Identifying changes...");
  await identifyChanges(existingData, sheetData);

  const endTime = Date.now(); // End tracking execution time
  console.log(
    `Sync process completed in ${(endTime - startTime) / 1000} seconds.`
  );
}

// Run the script
main().catch(console.error);
