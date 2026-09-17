USE tvms;

ALTER TABLE users ADD COLUMN violator_id INT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_violator FOREIGN KEY (violator_id) REFERENCES violators(violator_id) ON DELETE SET NULL;