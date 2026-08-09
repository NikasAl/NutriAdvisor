package main

import (
        "flag"
        "fmt"
        "log/slog"
        "net/http"
        "os"
        "os/signal"
        "strings"
        "syscall"

        "github.com/NikasAl/NutriAdvisor/server/config"
        "github.com/NikasAl/NutriAdvisor/server/handlers"
        "github.com/NikasAl/NutriAdvisor/server/proxy"
)

func main() {
        configPath := flag.String("config", "config.yaml", "path to config file")
        flag.Parse()

        // Load configuration
        cfg, err := config.Load(*configPath)
        if err != nil {
                fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
                os.Exit(1)
        }

        // Setup logging
        setupLogging(cfg)

        slog.Info("starting nuadvi-proxy",
                "version", "0.1.0",
                "listen", cfg.Server.Listen,
        )

        // Log config summary
        slog.Info(cfg.String())

        // Create proxy manager (SSH tunnels)
        proxyMgr := proxy.NewProxyManager(cfg.Proxies)
        proxyMgr.Start()

        // Create router with providers and pools
        router := proxy.NewRouter(cfg)
        router.SetProxyManager(proxyMgr)

        // Inject proxy transports into providers that need them
        router.InjectProxyTransports()

        // Create HTTP handler
        h := handlers.NewHandler(cfg, router)
        h.SetProxyManager(proxyMgr)

        // Setup routes
        mux := http.NewServeMux()
        h.RegisterRoutes(mux)

        // Create server
        srv := &http.Server{
                Addr:    cfg.Server.Listen,
                Handler: mux,
        }

        // Graceful shutdown
        go func() {
                sigCh := make(chan os.Signal, 1)
                signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
                sig := <-sigCh
                slog.Info("shutting down", "signal", sig.String())
                proxyMgr.Stop()
                srv.Close()
        }()

        // Start server
        slog.Info("server listening", "addr", cfg.Server.Listen)
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
                slog.Error("server error", "error", err)
                os.Exit(1)
        }

        slog.Info("server stopped")
}

func setupLogging(cfg *config.Config) {
        var level slog.Level
        switch strings.ToLower(cfg.Logging.Level) {
        case "debug":
                level = slog.LevelDebug
        case "warn":
                level = slog.LevelWarn
        case "error":
                level = slog.LevelError
        default:
                level = slog.LevelInfo
        }

        opts := &slog.HandlerOptions{Level: level}

        var handler slog.Handler
        if strings.ToLower(cfg.Logging.Format) == "json" {
                handler = slog.NewJSONHandler(os.Stdout, opts)
        } else {
                handler = slog.NewTextHandler(os.Stdout, opts)
        }

        slog.SetDefault(slog.New(handler))
}
