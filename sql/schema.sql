CREATE DATABASE IF NOT EXISTS tvms;
USE tvms;

CREATE TABLE IF NOT EXISTS violators (
  violator_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  license_no VARCHAR(30) NOT NULL UNIQUE,
  phone VARCHAR(15),
  address VARCHAR(255),
  demerit_points INT NOT NULL DEFAULT 0,
  license_status ENUM('Active', 'Flagged for Suspension') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'officer', 'violator') NOT NULL DEFAULT 'officer',
  violator_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_violator FOREIGN KEY (violator_id)
    REFERENCES violators(violator_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(20) NOT NULL UNIQUE,
  owner_name VARCHAR(100) NOT NULL,
  vehicle_type VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS challans (
  challan_id INT AUTO_INCREMENT PRIMARY KEY,
  violation_id INT NOT NULL UNIQUE,
  fine_amount DECIMAL(10,2) NOT NULL,
  status ENUM('Unpaid', 'Paid') NOT NULL DEFAULT 'Unpaid',
  due_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (violation_id) REFERENCES violations(violation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  challan_id INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_mode ENUM('Cash', 'UPI', 'Card', 'Net Banking') NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (challan_id) REFERENCES challans(challan_id) ON DELETE CASCADE
);

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
