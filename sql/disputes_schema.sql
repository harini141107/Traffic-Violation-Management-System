USE tvms;

CREATE TABLE IF NOT EXISTS disputes (
  dispute_id INT AUTO_INCREMENT PRIMARY KEY,
  challan_id INT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Upheld', 'Dismissed') NOT NULL DEFAULT 'Pending',
  filed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_date TIMESTAMP NULL,
  resolution_note TEXT,
  FOREIGN KEY (challan_id) REFERENCES challans(challan_id) ON DELETE CASCADE
);