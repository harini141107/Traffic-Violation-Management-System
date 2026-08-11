USE tvms;

CREATE TABLE IF NOT EXISTS violations (
  violation_id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  violator_id INT NOT NULL,
  violation_type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  violation_date DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  FOREIGN KEY (violator_id) REFERENCES violators(violator_id) ON DELETE CASCADE
);