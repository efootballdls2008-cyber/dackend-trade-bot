-- ══════════════════════════════════════════════════════════════════
-- Support Messages Table (Optional)
-- Stores support ticket history for audit and follow-up
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ticket_ref VARCHAR(50) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('low','medium','high') DEFAULT 'medium',
  status ENUM('pending','in_progress','resolved','closed') DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  resolved_by INT DEFAULT NULL,
  admin_notes TEXT DEFAULT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_priority (priority),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
