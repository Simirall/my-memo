INSERT INTO plan_limits (plan_id, metric, limit_value)
SELECT id, 'ai_suggestion.monthly', 30
FROM plans
WHERE true
ON CONFLICT(plan_id, metric) DO NOTHING;
