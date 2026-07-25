import pandas as pd

df = pd.read_csv("Fragrance_Data/fra_cleaned.csv", encoding="latin1", sep=";")

for column in df.select_dtypes(include="object").columns:
    if column.lower() == "url":
        continue

    df[column] = (
        df[column]
        .str.replace("-", " ", regex=False)
        .str.title()
    )

df["Rating Value"] = (
    df["Rating Value"]
    .str.replace(",", ".", regex=False)
    .astype(float)
)

df.to_csv("fra_cleaned_formatted.csv", index=False)