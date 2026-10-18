-- The marks became broad areas instead of single concepts: each old one goes to its area.
UPDATE "topics" SET "skin" = CASE "skin"
  WHEN 'orbit' THEN 'atoms' WHEN 'pendulum' THEN 'mechanics' WHEN 'spring' THEN 'mechanics' WHEN 'wave' THEN 'waves'
  WHEN 'infinity' THEN 'analysis' WHEN 'epsilon' THEN 'analysis' WHEN 'sequence' THEN 'analysis' WHEN 'partial' THEN 'analysis'
  WHEN 'integral' THEN 'calculus' WHEN 'tangent' THEN 'calculus' WHEN 'sigma' THEN 'calculus' WHEN 'phasor' THEN 'calculus' WHEN 'nabla' THEN 'fields'
  WHEN 'basis' THEN 'algebra' WHEN 'matrix' THEN 'algebra' WHEN 'lattice' THEN 'algebra' WHEN 'eigen' THEN 'algebra'
  WHEN 'therefore' THEN 'proof' WHEN 'implies' THEN 'proof' WHEN 'qed' THEN 'proof'
  ELSE "skin" END
WHERE "skin" IS NOT NULL;
