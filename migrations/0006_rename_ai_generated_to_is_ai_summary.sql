-- Custom SQL migration file, put your code below! --
ALTER TABLE `memos` RENAME COLUMN `ai_generated` TO `is_ai_summary`;
