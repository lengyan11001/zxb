WITH ranked_products AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, name
      ORDER BY created_at ASC, id ASC
    ) AS row_number
  FROM products
)
DELETE FROM products
WHERE id IN (
  SELECT id
  FROM ranked_products
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_name_unique
  ON products (organization_id, name);
