USE tvms;

CREATE TABLE IF NOT EXISTS challans (
  challan_id INT AUTO_INCREMENT PRIMARY KEY,
  violation_id INT NOT NULL UNIQUE,
  fine_amount DECIMAL(10,2) NOT NULL,
  status ENUM('Unpaid', 'Paid') NOT NULL DEFAULT 'Unpaid',
  due_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (violation_id) REFERENCES violations(violation_id) ON DELETE CASCADE
);