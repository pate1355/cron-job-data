# Google Sheets to Supabase Sync

## Overview

This project synchronizes job postings from a **Google Sheet** to **Supabase**. It detects **new, updated, and deleted** records, ensuring Supabase always has the latest data.

## Features

- **Insert New Records**: Adds new job postings from Google Sheets to Supabase.

- **Update Existing Records**: Only updates fields that have changed.

- **Delete Removed Records**: Deletes records from Supabase if they no longer exist in Google Sheets.

- **Execution Time Tracking**: Logs script execution duration.

- **Improved Logging**: Tracks changes for easier debugging.

## Technologies Used

- **Node.js**

- **Google Sheets API**

- **Supabase**

- **dotenv** (for environment variables)

- **Lodash** (for deep object comparison)

## Setup & Installation

### 1\. Clone the Repository

```
git clone https://github.com/pate1355/cron-job-data.git
cd cron-job-data
```

### 2\. Install Dependencies

```
npm install
```

### 3\. Configure Environment Variables

Create a `.env` file in the project root and add the following:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
FIREBASE_CREDENTIALS=your_base64_encoded_firebase_credentials
```

### 4\. Run the Script

```
node sync.js
```

## How It Works

1. **Fetch Data from Google Sheets**: The script retrieves job postings from the specified spreadsheet.
2. **Compare with Supabase Data**: It checks for new, updated, or deleted records.
3. **Apply Changes**:
   - Inserts new jobs.
   - Updates modified job postings.
   - Deletes jobs removed from the sheet.
4. **Logs Execution Time**: Helps monitor performance.

## Google Sheets Setup

- Ensure you have a Google Sheet with **headers in the first row**.

- The script reads data starting from `A:L` (Adjust `RANGE` if needed).

## Supabase Table Schema

Your `job_post_data` table should include these columns:

| Column              | Type          |
| ------------------- | ------------- |
| id                  | UUID / Serial |
| job_title           | Text          |
| company_name        | Text          |
| location            | Text          |
| job_type            | Text          |
| job_description     | Text          |
| tags                | Array         |
| job_category        | Text          |
| offered_salary      | Numeric       |
| experience_required | Text          |
| education_required  | Text          |
| count               | Numeric       |

## Debugging & Logs

- **Successful Sync**: Shows inserted, updated, and deleted records.

- **Errors**: Prints detailed error messages.
