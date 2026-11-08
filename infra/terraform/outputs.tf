output "clusters" {
  value = {
    for k, v in google_container_cluster.region : k => {
      name = v.name, region = v.location
    }
  }
}
output "api_endpoints" {
  value = {
    for k, v in local.regions : k => (k == "us" ? "https://${var.api_domain}" : "https://${k}.${var.api_domain}")
  }
}
output "dns_nameservers" {
  value = var.dns_zone_name == "" ? google_dns_managed_zone.api[0].name_servers : []
}
output "ci_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}
output "ci_service_account" {
  value = google_service_account.ci.email
}
output "api_service_account" {
  value = google_service_account.api.email
}
output "ai_service_account" {
  value = google_service_account.ai.email
}

output "firebase_public_config" {
  value = {
    project_id  = var.project_id
    api_key     = data.google_firebase_web_app_config.mobile.api_key
    auth_domain = data.google_firebase_web_app_config.mobile.auth_domain
  }
}
