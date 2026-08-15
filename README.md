# FragFriend

FragFriend is a full-stack fragrance discovery application backed by a searchable PostgreSQL dataset of more than 24,000 fragrances. It combines Python data pipelines, a FastAPI REST API, and a React/TypeScript interface so users can explore fragrances, filter by notes and accords, create accounts, bookmark fragrances, and organize favorites into collections.

## Project status

FragFriend is an active personal project. Core search, filtering, authentication, bookmarks, and collections are implemented. A personalized recommendation engine is planned and remains in development.

## Features

- Search fragrances by name and brand
- Filter by country, gender, rating, year, notes, and accords
- Sort and paginate search results
- View detailed fragrance information
- Register and authenticate users with JWT-based authentication
- Bookmark fragrances and organize favorites into collections
- Validate request parameters and return structured API responses
- Exercise backend behavior through automated API tests

## Architecture

```text
Source CSV files
      |
      v
Python/pandas cleaning and ETL scripts
      |
      v
PostgreSQL database
      |
      v
FastAPI + SQLAlchemy REST API
      |
      v
React + TypeScript frontend
```

The backend follows a layered structure:

- `Backend/routes/` defines HTTP endpoints and request validation.
- `Backend/services/` contains business logic and database queries.
- `Backend/models/` contains API data models.
- `Backend/migrations/` contains SQL migrations for application tables.
- `Tool_Scripts/` contains the pandas cleaning and PostgreSQL loading pipelines.
- `tests/` contains automated API tests.

## Technology stack

- **Data engineering:** Python, pandas, ETL, data cleaning and standardization
- **Backend:** FastAPI, SQLAlchemy, Pydantic
- **Database:** PostgreSQL
- **Authentication:** JWT and Argon2 password hashing
- **Frontend:** React, TypeScript, Vite
- **Testing and automation:** pytest, GitHub Actions, ESLint

## Data pipelines

The project separates data preparation and database loading into two processes:

1. `Tool_Scripts/FragCleaner.py` standardizes text fields and numeric ratings.
2. `Tool_Scripts/pgETL.py` applies the database column schema and loads the prepared records into PostgreSQL.

Raw and generated data files are intentionally excluded from this repository. Anyone running the pipelines must provide a legally obtained source dataset with the expected schema. Do not redistribute scraped data or images without permission from their respective owners.

## Local setup

### Prerequisites

- Python 3.11 or later
- PostgreSQL
- Node.js and npm

### 1. Clone the repository

```bash
git clone https://github.com/jimadiso/FragFriend.git
cd FragFriend
```

### 2. Configure the backend

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows PowerShell and install dependencies:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

On macOS or Linux:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and replace the placeholder values:

```env
DB_USER=postgres
DB_PASSWORD=replace_me
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fragfriend
JWT_SECRET=replace_with_a_long_random_value
```

Create the PostgreSQL database before running the application. If you are loading an authorized dataset, place it under `Fragrance_Data/`, run the cleaning script, and then run the ETL script. Apply the SQL migrations in `Backend/migrations/` to enable accounts, bookmarks, and collections.

Start the API from the repository root:

```bash
uvicorn Backend.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 3. Configure the frontend

```bash
cd Frontend
npm install
npm run dev
```

The development frontend runs at `http://localhost:5173` by default.

## Testing

Install the development requirements and run the backend tests from the repository root:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -v
```

Run frontend lint checks with:

```bash
npm --prefix Frontend run lint
```

## API overview

The API includes endpoints for:

- Fragrance listing, search, filtering, counts, and details
- Brand and filter-option search
- Account registration, login, and current-user retrieval
- User bookmarks
- User-created fragrance collections

See the generated OpenAPI documentation at `/docs` for current request parameters and response schemas.

## Responsible development

AI-assisted development tools were used during portions of this project. Generated suggestions were reviewed, corrected, and tested before integration. The implementation decisions and application behavior remain the responsibility of the project author.

## Roadmap

- Complete the personalized recommendation engine
- Expand integration and frontend tests
- Add reproducible local database provisioning
- Improve deployment configuration and production environment handling

