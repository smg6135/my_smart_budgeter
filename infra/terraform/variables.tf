variable "project_id" {
  type = string
}
variable "api_domain" {
  type        = string
  description = "US API hostname; Singapore uses sg beneath it."
  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.api_domain))
    error_message = "Supply an owned API domain."
  }
}
variable "github_repository" {
  type = string
}
variable "github_owner_id" {
  type = string
}
variable "admin_cidrs" {
  type        = list(string)
  description = "Operator public IPv4 CIDRs allowed to access Kubernetes control planes."
  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for v in var.admin_cidrs : can(cidrnetmask(v)) && v != "0.0.0.0/0"])
    error_message = "Use specific operator CIDRs, never 0.0.0.0/0."
  }
}
variable "web_origins" {
  type = list(string)
}
variable "google_oauth_client_id" {
  type        = string
  default     = ""
  description = "Enable Google OAuth after supplying the web client ID and its Secret Manager secret."
}
variable "google_oauth_secret_name" {
  type    = string
  default = "pocket-google-oauth-secret"
}
variable "google_oauth_secret_version" {
  type    = string
  default = "latest"
}
variable "deletion_protection" {
  type    = bool
  default = true
}
variable "firestore_location" {
  type    = string
  default = "nam5"
}
locals {
  regions = {
    us = {
      region = "us-central1", index = 20
    }
    sg = {
      region = "asia-southeast1", index = 30
    }
  }
  apis = toset(["container.googleapis.com", "compute.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "identitytoolkit.googleapis.com", "firebase.googleapis.com", "firestore.googleapis.com", "aiplatform.googleapis.com", "dns.googleapis.com", "firebaserules.googleapis.com", "sqladmin.googleapis.com", "servicenetworking.googleapis.com"])
}

variable "dns_zone_name" {
  type        = string
  default     = ""
  description = "Existing Cloud DNS zone in this project. Empty creates a delegated backend zone."
}

variable "firestore_database" {
  type    = string
  default = "pocket-usage"
}
variable "initialize_firebase" {
  type        = bool
  default     = false
  description = "Enable only for a project without an existing Firebase/Auth setup."
}
variable "publish_dns" {
  type        = bool
  default     = false
  description = "Switch the public API records after the deployments pass health checks."
}
