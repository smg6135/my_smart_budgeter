resource "google_project_service" "api" {
  for_each           = local.apis
  service            = each.key
  disable_on_destroy = false
}
resource "google_compute_network" "platform" {
  name                    = "pocket-platform"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.api]
}
resource "google_compute_subnetwork" "region" {
  for_each                 = local.regions
  name                     = "pocket-${each.key}"
  region                   = each.value.region
  network                  = google_compute_network.platform.id
  ip_cidr_range            = "10.${each.value.index}.0.0/20"
  private_ip_google_access = true
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.${each.value.index + 1}.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.${each.value.index + 2}.0.0/20"
  }
}
resource "google_compute_router" "region" {
  for_each = local.regions
  name     = "pocket-${each.key}"
  region   = each.value.region
  network  = google_compute_network.platform.id
}
resource "google_compute_router_nat" "region" {
  for_each                           = local.regions
  name                               = "pocket-egress"
  router                             = google_compute_router.region[each.key].name
  region                             = each.value.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                    = google_compute_subnetwork.region[each.key].id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
}
resource "google_service_account" "node" {
  account_id = "pocket-gke-nodes"
}
resource "google_project_iam_member" "nodes" {
  for_each = toset(["roles/container.defaultNodeServiceAccount", "roles/artifactregistry.reader"])
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.node.email}"
}
resource "google_container_cluster" "region" {
  for_each            = local.regions
  name                = "pocket-${each.key}"
  location            = each.value.region
  enable_autopilot    = true
  deletion_protection = var.deletion_protection
  network             = google_compute_network.platform.id
  subnetwork          = google_compute_subnetwork.region[each.key].id
  release_channel {
    channel = "REGULAR"
  }
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.${each.value.index}.0/28"
  }
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.admin_cidrs
      content {
        cidr_block   = cidr_blocks.value
        display_name = "operator"
      }
    }
  }
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
  gateway_api_config {
    channel = "CHANNEL_STANDARD"
  }
  secret_manager_config {
    enabled = true
  }
  cluster_autoscaling {
    auto_provisioning_defaults {
      service_account = google_service_account.node.email
      oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    }
  }
  depends_on = [google_project_service.api, google_project_iam_member.nodes]
}
resource "google_artifact_registry_repository" "images" {
  for_each      = local.regions
  location      = each.value.region
  repository_id = "pocket"
  format        = "DOCKER"
  depends_on    = [google_project_service.api]
}
resource "google_secret_manager_secret" "platform" {
  for_each  = toset(["pocket-openai-key", "pocket-litellm-key", "pocket-redis-password", "pocket-litellm-database-url", "pocket-litellm-salt-key", "pocket-litellm-ui-password"])
  secret_id = each.key
  replication {
    auto {
    }
  }
  depends_on = [google_project_service.api]
}
# Provider keys are seeded outside Terraform, so they never enter Terraform input/state.
resource "random_password" "internal" {
  for_each = toset(["pocket-litellm-key", "pocket-redis-password", "pocket-litellm-salt-key", "pocket-litellm-ui-password"])
  length   = 48
  special  = false
}
resource "google_secret_manager_secret_version" "internal" {
  for_each    = random_password.internal
  secret      = google_secret_manager_secret.platform[each.key].id
  secret_data = each.key == "pocket-litellm-key" ? "sk-${each.value.result}" : each.value.result
}
resource "google_service_account" "api" {
  account_id = "pocket-api"
}
resource "google_service_account" "ai" {
  account_id = "pocket-ai"
}
resource "google_project_iam_member" "api_usage" {
  condition {
    title      = "pocket-usage-only"
    expression = "resource.name == \"projects/${var.project_id}/databases/${var.firestore_database}\""
  }
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "api_identity" {
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "ai_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.ai.email}"
}
resource "google_service_account_iam_member" "api_workload" {
  depends_on         = [google_container_cluster.region]
  service_account_id = google_service_account.api.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[pocket/api]"
}
resource "google_service_account_iam_member" "ai_workload" {
  depends_on         = [google_container_cluster.region]
  service_account_id = google_service_account.ai.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[pocket/ai]"
}
resource "google_secret_manager_secret_iam_member" "api_secrets" {
  for_each  = toset(["pocket-litellm-key", "pocket-redis-password"])
  secret_id = google_secret_manager_secret.platform[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
resource "google_secret_manager_secret_iam_member" "ai_secrets" {
  for_each  = toset(["pocket-litellm-key", "pocket-openai-key", "pocket-litellm-database-url", "pocket-litellm-salt-key", "pocket-litellm-ui-password"])
  secret_id = google_secret_manager_secret.platform[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.ai.email}"
}
resource "google_firestore_database" "usage" {
  project                 = var.project_id
  name                    = var.firestore_database
  location_id             = var.firestore_location
  type                    = "FIRESTORE_NATIVE"
  deletion_policy         = var.deletion_protection ? "ABANDON" : "DELETE"
  delete_protection_state = var.deletion_protection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
  depends_on              = [google_project_service.api]
}
resource "google_firestore_field" "ttl" {
  project    = var.project_id
  database   = google_firestore_database.usage.name
  collection = "ai_daily_usage"
  field      = "expire_at"
  ttl_config {
  }
}
resource "google_identity_platform_config" "auth" {
  count   = var.initialize_firebase ? 1 : 0
  project = var.project_id
  sign_in {
    allow_duplicate_emails = false
    email {
      enabled           = true
      password_required = true
    }
  }
  authorized_domains = concat(["localhost", "${var.project_id}.firebaseapp.com"], [for origin in var.web_origins : trimprefix(origin, "https://")])
  depends_on         = [google_project_service.api, google_firebase_project.auth]
}
# Configure Google OAuth after seeding its client secret in Secret Manager.
data "google_secret_manager_secret_version" "oauth" {
  count      = var.google_oauth_client_id != "" ? 1 : 0
  secret     = var.google_oauth_secret_name
  version    = var.google_oauth_secret_version
  depends_on = [google_project_service.api]
}
resource "google_identity_platform_default_supported_idp_config" "google" {
  count         = var.google_oauth_client_id != "" ? 1 : 0
  enabled       = true
  idp_id        = "google.com"
  client_id     = var.google_oauth_client_id
  client_secret = data.google_secret_manager_secret_version.oauth[0].secret_data
  depends_on    = [google_identity_platform_config.auth]
}
resource "google_compute_global_address" "gateway" {
  for_each = local.regions
  name     = "pocket-${each.key}-gateway"
}
resource "google_dns_managed_zone" "api" {
  count    = var.dns_zone_name == "" ? 1 : 0
  name     = "pocket-api"
  dns_name = "${var.api_domain}."
}
resource "google_dns_record_set" "api" {
  for_each     = var.publish_dns ? local.regions : {}
  name         = each.key == "us" ? "${var.api_domain}." : "${each.key}.${var.api_domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.dns_zone_name != "" ? var.dns_zone_name : google_dns_managed_zone.api[0].name
  rrdatas      = [google_compute_global_address.gateway[each.key].address]
}
resource "google_compute_managed_ssl_certificate" "api" {
  for_each = local.regions
  name     = "pocket-${each.key}-tls"
  managed {
    domains = [each.key == "us" ? var.api_domain : "${each.key}.${var.api_domain}"]
  }
}
resource "google_compute_security_policy" "edge" {
  name = "pocket-api-edge"
  rule {
    priority = 1000
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})"
      }
    }
  }
  rule {
    priority = 1001
    action   = "deny(403)"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})"
      }
    }
  }
  rule {
    priority = 2000
    action   = "throttle"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 300
        interval_sec = 60
      }
    }
  }
  rule {
    priority = 2147483647
    action   = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
resource "google_compute_firewall" "health" {
  name                    = "pocket-lb-health"
  network                 = google_compute_network.platform.name
  source_ranges           = ["35.191.0.0/16", "130.211.0.0/22"]
  target_service_accounts = [google_service_account.node.email]
  allow {
    protocol = "tcp"
    ports    = ["8000"]
  }
}
resource "google_service_account" "ci" {
  account_id = "pocket-ci"
}
resource "google_artifact_registry_repository_iam_member" "ci" {
  for_each   = local.regions
  repository = google_artifact_registry_repository.images[each.key].name
  location   = each.value.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "pocket-github"
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject" = "assertion.sub", "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.repository_owner_id == '${var.github_owner_id}' && assertion.ref == 'refs/heads/main'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
resource "google_service_account_iam_member" "ci_federation" {
  service_account_id = google_service_account.ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_firebase_project" "auth" {
  count      = var.initialize_firebase ? 1 : 0
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.api]
}
resource "google_firebase_web_app" "mobile" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Pocket mobile and web"
  depends_on   = [google_firebase_project.auth]
}
data "google_firebase_web_app_config" "mobile" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.mobile.app_id
}
resource "google_service_account" "redis" {
  account_id = "pocket-redis"
}
resource "google_service_account_iam_member" "redis_workload" {
  depends_on         = [google_container_cluster.region]
  service_account_id = google_service_account.redis.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[pocket/redis]"
}
data "google_project" "current" {}
locals {
  mounted_secrets = {
    api_litellm = { account = "api", secret = "pocket-litellm-key" }
    api_redis   = { account = "api", secret = "pocket-redis-password" }
    ai_litellm  = { account = "ai", secret = "pocket-litellm-key" }
    ai_openai   = { account = "ai", secret = "pocket-openai-key" }
    ai_database = { account = "ai", secret = "pocket-litellm-database-url" }
    ai_salt     = { account = "ai", secret = "pocket-litellm-salt-key" }
    ai_ui       = { account = "ai", secret = "pocket-litellm-ui-password" }
    redis       = { account = "redis", secret = "pocket-redis-password" }
  }
}
resource "google_secret_manager_secret_iam_member" "mounts" {
  depends_on = [google_container_cluster.region]
  for_each   = local.mounted_secrets
  secret_id  = google_secret_manager_secret.platform[each.value.secret].id
  role       = "roles/secretmanager.secretAccessor"
  member     = "principal://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/subject/ns/pocket/sa/${each.value.account}"
}
resource "google_firebaserules_ruleset" "firestore" {
  project = var.project_id
  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../services/emulators/firestore.rules")
    }
  }
  depends_on = [google_firebase_project.auth, google_firestore_database.usage]
}
resource "google_firebaserules_release" "firestore" {
  project      = var.project_id
  name         = "cloud.firestore/${var.firestore_database}"
  ruleset_name = google_firebaserules_ruleset.firestore.name
}

resource "google_firebase_apple_app" "mobile" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "Pocket Budget iOS"
  bundle_id       = "com.mingonsong.pocketbudget"
  deletion_policy = "ABANDON"
  depends_on      = [google_project_service.api]
}
data "google_firebase_apple_app_config" "mobile" {
  provider = google-beta
  project  = var.project_id
  app_id   = google_firebase_apple_app.mobile.app_id
}
resource "google_secret_manager_secret_iam_member" "redis_secret" {
  secret_id = google_secret_manager_secret.platform["pocket-redis-password"].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.redis.email}"
}
