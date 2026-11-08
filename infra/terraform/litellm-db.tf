resource "google_compute_global_address" "sql_range" {
  name          = "pocket-sql-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  address       = "10.40.0.0"
  network       = google_compute_network.platform.id
}
resource "google_service_networking_connection" "sql" {
  network                 = google_compute_network.platform.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql_range.name]
  depends_on              = [google_project_service.api]
}
resource "google_sql_database_instance" "litellm" {
  name                = "pocket-litellm"
  region              = "us-central1"
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection
  settings {
    tier              = "db-f1-micro"
    edition           = "ENTERPRISE"
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.platform.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
  }
  depends_on = [google_service_networking_connection.sql]
}
resource "google_sql_database" "litellm" {
  name     = "litellm"
  instance = google_sql_database_instance.litellm.name
}
resource "random_password" "database" {
  length  = 40
  special = false
}
resource "google_sql_user" "litellm" {
  name     = "litellm"
  instance = google_sql_database_instance.litellm.name
  password = random_password.database.result
}
resource "google_secret_manager_secret_version" "database" {
  secret      = google_secret_manager_secret.platform["pocket-litellm-database-url"].id
  secret_data = "postgresql://litellm:${random_password.database.result}@127.0.0.1:5432/litellm?sslmode=disable&connection_limit=3&pool_timeout=30"
}
resource "google_project_iam_member" "ai_database" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.ai.email}"
}
output "litellm_database_connection" {
  value = google_sql_database_instance.litellm.connection_name
}
