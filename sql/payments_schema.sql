USE tvms;

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  challan_id INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_mode ENUM('Cash', 'UPI', 'Card', 'Net Banking') NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (challan_id) REFERENCES challans(challan_id) ON DELETE CASCADE
);