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
- **Testing and quality:** pytest, ESLint

## Data pipelines

The project separates data preparation and database loading into two processes:

1. `Tool_Scripts/FragCleaner.py` standardizes text fields and numeric ratings.
2. `Tool_Scripts/pgETL.py` applies the database column schema and loads the prepared records into PostgreSQL.

Raw and generated data files are intentionally excluded from this repository. Running the pipelines requires a legally obtained source dataset with the expected schema. This repository does not redistribute scraped data or images because their redistribution rights have not been established.