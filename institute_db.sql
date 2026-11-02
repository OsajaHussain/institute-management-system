-- ============================================================
-- Institute Management System (MySQL 8.0.16 or newer)
-- Made by Osaja Hussain
-- WARNING: this file DROPS and recreates institute_db. Run it only once
-- at setup. Running it again deletes all saved data.
-- ============================================================
DROP DATABASE IF EXISTS institute_db;
CREATE DATABASE institute_db;
USE institute_db;

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','teacher','receptionist') NOT NULL
);
CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  guardian_phone VARCHAR(20),
  admission_date DATE DEFAULT (CURRENT_DATE)
);
CREATE TABLE teachers (
  teacher_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(80),
  salary DECIMAL(10,2) CHECK (salary >= 0)
);
CREATE TABLE courses (
  course_id INT AUTO_INCREMENT PRIMARY KEY,
  course_name VARCHAR(100) NOT NULL UNIQUE,
  fee DECIMAL(10,2) NOT NULL CHECK (fee >= 0)
);
CREATE TABLE batches (
  batch_id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  teacher_id INT NOT NULL,
  timing VARCHAR(50),
  FOREIGN KEY (course_id) REFERENCES courses(course_id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id)
);
CREATE TABLE enrollments (
  enroll_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  batch_id INT NOT NULL,
  total_fee DECIMAL(10,2) DEFAULT 0,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  UNIQUE (student_id, batch_id),
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);
CREATE TABLE attendance (
  att_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  batch_id INT NOT NULL,
  att_date DATE NOT NULL,
  status ENUM('P','A','L') NOT NULL,
  UNIQUE (student_id, batch_id, att_date),
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);
CREATE TABLE fee_payments (
  pay_id INT AUTO_INCREMENT PRIMARY KEY,
  enroll_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  pay_date DATE DEFAULT (CURRENT_DATE),
  FOREIGN KEY (enroll_id) REFERENCES enrollments(enroll_id) ON DELETE CASCADE
);
CREATE TABLE results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  batch_id INT NOT NULL,
  exam_name VARCHAR(80) NOT NULL,
  marks DECIMAL(5,2) NOT NULL,
  total DECIMAL(5,2) NOT NULL,
  grade CHAR(2),
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);

-- Indexes
CREATE INDEX idx_att_date ON attendance(att_date);
CREATE INDEX idx_pay_date ON fee_payments(pay_date);
CREATE INDEX idx_student_name ON students(name);

-- Triggers
DELIMITER //
CREATE TRIGGER trg_enroll_fee BEFORE INSERT ON enrollments
FOR EACH ROW
BEGIN
  SET NEW.total_fee = (SELECT c.fee FROM batches b
                       JOIN courses c ON c.course_id = b.course_id
                       WHERE b.batch_id = NEW.batch_id);
END//
CREATE TRIGGER trg_fee_paid AFTER INSERT ON fee_payments
FOR EACH ROW
BEGIN
  UPDATE enrollments SET paid_amount = paid_amount + NEW.amount
  WHERE enroll_id = NEW.enroll_id;
END//
CREATE TRIGGER trg_grade BEFORE INSERT ON results
FOR EACH ROW
BEGIN
  DECLARE p DECIMAL(6,2);
  SET p = NEW.marks * 100 / NEW.total;
  SET NEW.grade = CASE WHEN p >= 85 THEN 'A+' WHEN p >= 75 THEN 'A'
                       WHEN p >= 65 THEN 'B' WHEN p >= 50 THEN 'C'
                       ELSE 'F' END;
END//

CREATE TRIGGER trg_grade_upd BEFORE UPDATE ON results
FOR EACH ROW
BEGIN
  DECLARE p DECIMAL(6,2);
  SET p = NEW.marks * 100 / NEW.total;
  SET NEW.grade = CASE WHEN p >= 85 THEN 'A+' WHEN p >= 75 THEN 'A'
                       WHEN p >= 65 THEN 'B' WHEN p >= 50 THEN 'C'
                       ELSE 'F' END;
END//
CREATE TRIGGER trg_fee_del AFTER DELETE ON fee_payments
FOR EACH ROW
BEGIN
  UPDATE enrollments SET paid_amount = paid_amount - OLD.amount
  WHERE enroll_id = OLD.enroll_id;
END//

-- Stored procedures
CREATE PROCEDURE sp_defaulters()
BEGIN
  SELECT s.name, c.course_name, e.total_fee, e.paid_amount,
         (e.total_fee - e.paid_amount) AS pending
  FROM enrollments e
  JOIN students s ON s.student_id = e.student_id
  JOIN batches b ON b.batch_id = e.batch_id
  JOIN courses c ON c.course_id = b.course_id
  WHERE e.total_fee > e.paid_amount
  ORDER BY pending DESC;
END//
CREATE PROCEDURE sp_monthly_fee_report(IN m INT, IN y INT)
BEGIN
  SELECT DATE(pay_date) AS day, SUM(amount) AS collected
  FROM fee_payments
  WHERE MONTH(pay_date) = m AND YEAR(pay_date) = y
  GROUP BY DATE(pay_date) WITH ROLLUP;
END//
DELIMITER ;

-- Views
CREATE VIEW v_fee_status AS
SELECT s.name AS student, c.course_name, e.total_fee, e.paid_amount,
       (e.total_fee - e.paid_amount) AS pending
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN batches b ON b.batch_id = e.batch_id
JOIN courses c ON c.course_id = b.course_id;

CREATE VIEW v_attendance_summary AS
SELECT s.name AS student, b.batch_id,
       SUM(a.status='P') AS present, SUM(a.status='A') AS absent,
       ROUND(100*SUM(a.status='P')/COUNT(*),1) AS percent
FROM attendance a
JOIN students s ON s.student_id = a.student_id
JOIN batches b ON b.batch_id = a.batch_id
GROUP BY s.name, b.batch_id;

CREATE VIEW v_top_students AS
SELECT s.name, r.exam_name, r.marks, r.total, r.grade
FROM results r JOIN students s ON s.student_id = r.student_id
ORDER BY r.marks / r.total DESC;

-- Sample data
-- (login users are created automatically by the Node app on first start)
INSERT INTO students (name, guardian_phone) VALUES
 ('Ali Raza','03001234567'),('Sara Khan','03111234567'),
 ('Hamza Ahmed','03211234567'),('Ayesha Noor','03331234567');
INSERT INTO teachers (name, subject, salary) VALUES
 ('Sir Imran','Physics',50000),('Miss Hina','Maths',45000),('Sir Usman','Computer',55000);
INSERT INTO courses (course_name, fee) VALUES
 ('Physics Crash Course',5000),('Maths Foundation',4000),('Python Basics',6000);
INSERT INTO batches (course_id, teacher_id, timing) VALUES
 (1,1,'4-5 PM'),(2,2,'5-6 PM'),(3,3,'6-7 PM');
INSERT INTO enrollments (student_id, batch_id) VALUES (1,1),(2,1),(3,2),(4,3),(1,3);
INSERT INTO fee_payments (enroll_id, amount) VALUES (1,5000),(2,2000),(3,4000),(4,3000);
INSERT INTO attendance (student_id, batch_id, att_date, status) VALUES
 (1,1,CURRENT_DATE,'P'),(2,1,CURRENT_DATE,'A'),(3,2,CURRENT_DATE,'P'),(4,3,CURRENT_DATE,'P');
INSERT INTO results (student_id, batch_id, exam_name, marks, total) VALUES
 (1,1,'Test 1',45,50),(2,1,'Test 1',32,50),(3,2,'Test 1',38,50);

-- Try these:
-- CALL sp_defaulters();
-- CALL sp_monthly_fee_report(MONTH(CURRENT_DATE), YEAR(CURRENT_DATE));
-- SELECT * FROM v_fee_status;
-- SELECT * FROM v_attendance_summary;
-- SELECT * FROM v_top_students;
