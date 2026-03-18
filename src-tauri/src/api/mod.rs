pub mod routes;

use crate::db::Database;
use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::{self, Next},
    response::Response,
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

/// Shared state for API handlers.
#[derive(Clone)]
pub struct ApiState {
    pub db: Arc<Database>,
    pub token: String,
}

/// Bearer token auth middleware.
async fn auth_middleware(
    state: axum::extract::State<ApiState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    match auth {
        Some(val) if val == format!("Bearer {}", state.token) => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

/// Build the axum router with all API routes.
fn build_router(state: ApiState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .nest("/api", routes::router())
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(cors)
        .with_state(state)
}

/// Start the embedded HTTP API server.
pub async fn start_api_server(db: Arc<Database>, token: String, port: u16, host: String) {
    let state = ApiState { db, token };
    let app = build_router(state);

    let addr = format!("{}:{}", host, port);
    log::info!("[API] Starting embedded HTTP server on http://{}", addr);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("[API] Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        log::error!("[API] Server error: {}", e);
    }
}
