# 🚀 EelJet - Deployment Platform

Deploy your web applications in seconds. Connect your GitHub repository, configure your environment, and get your app live at `yourapp.eeljet.com` with automatic HTTPS.

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![HTTPS](https://img.shields.io/badge/HTTPS-Automatic-green)

## 🌐 Platform

**Deploy at:** [eeljet.com](https://eeljet.com)

## 📋 What is EelJet?

EelJet is a deployment platform that takes your code from GitHub and puts it live on the web. No server configuration, no SSL certificates to manage, no complex setups - just connect your repository and deploy.

### How It Works

1. **Connect** - Sign in with GitHub and select your repository
2. **Configure** - Choose your subdomain and add environment variables
3. **Deploy** - Click deploy and watch your app go live
4. **Manage** - Control deployments, view logs, and update anytime

Your app will be accessible at `yourapp.eeljet.com` with HTTPS automatically configured.

## ✨ Features

### Simple Deployment

- **GitHub Integration** - Import any repository with one click
- **Auto-Detection** - Automatically detects build configuration
- **Zero Config** - No configuration files needed
- **Instant HTTPS** - Every deployment includes SSL certificate

### Environment Management

- **Secure Variables** - Encrypted environment variable storage
- **Easy Input** - Paste your entire `.env` file or add variables individually
- **Build & Runtime** - Variables available during build and at runtime
- **Update Anytime** - Modify and redeploy without rebuilding

### Deployment Control

- **Real-Time Logs** - Watch your deployment happen live
- **Quick Redeploy** - Rebuild and restart with one click
- **Deployment History** - Track all deployments and changes
- **Easy Rollback** - Return to previous versions instantly

### Subdomain Management

- **Custom Subdomains** - Pick any available name
- **Automatic DNS** - DNS configured automatically
- **SSL Included** - HTTPS enabled on all deployments
- **Multiple Apps** - Deploy multiple projects under one account

## 🚀 Getting Started

### Prerequisites

- GitHub account
- A web application in a GitHub repository

### Deploy Your First App

1. **Sign Up**
   - Visit [eeljet.com](https://eeljet.com)
   - Sign in with your GitHub account
   - Authorize EelJet to access your repositories

2. **Import Repository**
   - Click "New Deployment"
   - Select repository from the list
   - Choose branch to deploy

3. **Configure Deployment**
   - Pick a subdomain: `myapp.eeljet.com`
   - Add environment variables (optional)
   - Review configuration

4. **Deploy**
   - Click "Deploy"
   - Watch real-time deployment logs
   - Access your live app!

### Example Deployment

```bash
$ eeljet deploy my-web-app

✓ Repository cloned from github.com/username/my-web-app
✓ Branch: main @ commit 3f2a1b9
✓ Dependencies installed with pnpm
✓ Environment variables configured
✓ Build completed in 12.3s
✓ Application started successfully
✓ SSL certificate issued
✓ DNS configured

🎉 Deployment successful!
🌐 Live at: https://my-web-app.eeljet.com
```

## 🔧 Environment Variables

Environment variables are securely stored and injected during deployment.

### Adding Variables

**Option 1: Paste `.env` file**

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
API_KEY=your-api-key
SECRET_KEY=your-secret
```

**Option 2: Add individually**

- Variable name: `DATABASE_URL`
- Variable value: `postgresql://...`

### Variable Security

- All variables encrypted at rest
- Never exposed in logs or dashboard
- Accessible only to your deployment
- Updated independently of code

## 📊 Dashboard

### App Overview

- View all deployed applications
- Check deployment status
- Monitor uptime and health
- Quick access to app URLs

### Deployment History

- Complete deployment timeline
- Build logs for each deployment
- Success/failure status
- Deployment duration and details

### App Management

- **Redeploy** - Rebuild from latest code
- **Restart** - Quick restart without rebuild
- **Stop** - Pause application
- **Delete** - Remove deployment and free subdomain

## 🔄 Continuous Deployment

### Auto-Deploy

Enable automatic deployments when you push to GitHub:

1. Go to your app settings
2. Enable "Auto-Deploy on Push"
3. Select branches to watch
4. Push to GitHub - EelJet deploys automatically

### Manual Deploy

Trigger deployments manually from the dashboard anytime.

## 🛠️ Technical Implementation

### Architecture

```
User Dashboard (Next.js App)
    ↓
GitHub OAuth Authentication
    ↓
Repository Import & Clone
    ↓
Build Pipeline
    ├─ Dependency Installation
    ├─ Environment Injection
    └─ Application Build
    ↓
Deployment Server
    ├─ Process Management (PM2)
    ├─ Reverse Proxy (Nginx)
    └─ SSL Certificate (Let's Encrypt)
    ↓
https://yourapp.eeljet.com
```

### Tech Stack

**Platform (This Repository)**

- Next.js 16 with App Router
- TypeScript 5
- React 19
- Tailwind CSS 4
- Radix UI components
- PostgreSQL + Prisma ORM
- NextAuth.js for GitHub OAuth

**Infrastructure**

- SSH2 for remote operations
- Nginx for reverse proxy
- PM2 for process management
- Let's Encrypt for SSL
- libsodium for encryption

## 📁 Project Structure

```
eeljet/
├── app/
│   ├── (dashboard)/       # User dashboard
│   ├── (marketing)/       # Landing pages
│   └── api/               # API endpoints
│       ├── deploy/        # Deployment operations
│       ├── github/        # GitHub integration
│       └── apps/          # App management
├── components/
│   ├── ui/               # UI primitives
│   ├── dashboard/        # Dashboard components
│   └── deploy/           # Deployment UI
├── lib/
│   ├── deployment.ts     # Deployment orchestration
│   ├── ssh.ts           # SSH operations
│   ├── nginx.ts         # Nginx configuration
│   ├── github.ts        # GitHub API client
│   └── encryption.ts    # Variable encryption
└── prisma/
    └── schema.prisma     # Database models
```

## 🔐 Security

### User Security

- GitHub OAuth authentication
- Encrypted environment variables
- Isolated application environments
- HTTPS enforced on all deployments
- Secure session management

### Platform Security

- SQL injection prevention (Prisma ORM)
- XSS protection (React)
- CSRF protection
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure SSH key authentication

## 🚧 Current Status & Roadmap

### Currently Supported

- ✅ GitHub repository integration
- ✅ Automatic build detection
- ✅ Environment variable management
- ✅ Custom subdomain assignment
- ✅ Automatic HTTPS/SSL
- ✅ Deployment history and logs
- ✅ One-click redeployment

### Coming Soon

- Support for additional frameworks
- Enhanced monitoring and analytics
- Custom domain support
- Team collaboration features
- Advanced deployment controls
- API for programmatic access

## 🤝 Contributing

Contributions are welcome! Whether you're fixing bugs, improving documentation, or adding features:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Contact & Support

**Platform Issues**

- Email: support@eeljet.com

**Development**

- GitHub: [@clebertmarctyson](https://github.com/clebertmarctyson)
- Email: contact@marctysonclebert.com
- Website: [marctysonclebert.com](https://marctysonclebert.com)

## 🙏 Acknowledgments

Built with modern web technologies and inspired by the deployment experience of leading platforms in the industry.

---

_Deploy your app. Get a subdomain. Simple as that._
