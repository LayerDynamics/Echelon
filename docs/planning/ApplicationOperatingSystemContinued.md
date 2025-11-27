
### 12.6 Development Tools

**Django Debug Toolbar:**

- SQL query inspector
- Template rendering time
- Cache hits/misses
- Signal calls
- HTTP headers

**Rails Console:**
rails console
> Article.where(status: 'published').count
> user = User.find(1)
> user.update(email: '<new@example.com>')

**Database Shell:**
python manage.py dbshell  # Opens psql, mysql, etc.

**Responsibilities:**

- Provide non-technical interface for data management
- Enable bulk operations and imports
- Support system administration tasks
- Audit and log changes
- Monitor system health
- Provide development/debugging tools

---

## 13. Plugin/Extension Architecture

Enable third-party code to extend core functionality.

### 13.1 Extension Models

**Django Apps:**

- Self-contained Python packages
- Own models, views, templates, static files
- Installed via `INSTALLED_APPS` setting
- URL routing via `include()`

# settings.py

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'myapp',
    'third_party_app',  # Extend functionality
]

# urls.py

urlpatterns = [
    path('admin/', admin.site.urls),
    path('blog/', include('blog.urls')),
    path('shop/', include('shop.urls')),
]

**WordPress Plugins:**

- PHP files in `wp-content/plugins/`
- Hook into actions and filters
- Activated via admin UI

```php
<?php
/*
Plugin Name: My Custom Plugin
Description: Adds custom functionality
Version: 1.0
*/

// Hook into WordPress
add_action('init', 'my_plugin_init');
add_filter('the_content', 'my_plugin_modify_content');

function my_plugin_init() {
    // Initialization code
}

function my_plugin_modify_content($content) {
    return $content . '<p>Added by plugin</p>';
}
```

**WordPress Themes:**

- Control site appearance
- Template files override core templates
- Theme functions.php extends functionality

### 13.2 Hook/Event Systems

**WordPress Actions:**
// Core fires action at specific point
do_action('publish_post', $post_id);

// Plugin listens for action
add_action('publish_post', function($post_id) {
    // Send notification, update cache, etc.
}, 10, 1);  // Priority 10, 1 argument

**WordPress Filters:**
// Core applies filter to value
$title = apply_filters('the_title', $post->post_title, $post->ID);

// Plugin modifies value
add_filter('the_title', function($title, $post_id) {
    return strtoupper($title);  // All caps titles
}, 10, 2);

**Django Signals:**
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

@receiver(post_save, sender=Article)
def article_saved(sender, instance, created, **kwargs):
    if created:
        # Send notification on new article
        send_notification(instance)

**Custom Signals:**

# Define signal

from django.dispatch import Signal
order_placed = Signal()

# Fire signal

order_placed.send(sender=Order, order=order_instance)

# Listen for signal

@receiver(order_placed)
def process_order(sender, order, **kwargs):
    # Process order
    ...

### 13.3 Extension Points

**Middleware Extension:**

- Add custom middleware classes
- Inject behavior at request/response boundaries

**Template Tag Extension:**

# Django

from django import template
register = template.Library()

@register.simple_tag
def show_widget():
    return '<div>Widget from plugin</div>'

**Model Extension:**

# Django abstract base classes

class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class Article(TimestampedModel):
    # Inherits timestamp fields
    title = models.CharField(max_length=200)

**Admin Extension:**

# Django - extend admin

from django.contrib import admin

class CustomAdminSite(admin.AdminSite):
    site_header = 'My Custom Admin'

admin_site = CustomAdminSite(name='custom_admin')

### 13.4 Plugin APIs

**Provide Hooks for Plugins:**

# Core code

def process_payment(order):
    # Allow plugins to modify order before payment
    order = apply_filters('pre_payment', order)

    # Process payment
    result = payment_gateway.charge(order.total)

    # Allow plugins to react to payment
    do_action('payment_complete', order, result)

**Plugin Configuration:**

# Django - plugin settings

MY_PLUGIN_SETTING = getattr(settings, 'MY_PLUGIN_SETTING', 'default')

### 13.5 Plugin Discovery & Loading

**Automatic Discovery:**

- Scan directories for plugins
- Load based on naming conventions
- Enable/disable via configuration

**Dependency Management:**

# Django app dependencies

class MyAppConfig(AppConfig):
    name = 'myapp'

    def ready(self):
        # Ensure dependencies loaded
        if 'other_app' not in settings.INSTALLED_APPS:
            raise ImproperlyConfigured('myapp requires other_app')

**Version Compatibility:**

- Semantic versioning
- Declare compatible framework versions
- Graceful degradation

### 13.6 Plugin Security

**Sandbox Execution:**

- Limited permissions
- Can't access certain APIs
- Resource limits (CPU, memory)

**Code Review:**

- Official plugin repositories with review process
- Security scanning
- Community reporting

**Capability System:**
// WordPress capabilities
if (current_user_can('edit_posts')) {
    // Allow
}

### 13.7 Plugin Marketplaces

**WordPress.org Plugin Directory:**

- 60,000+ plugins
- Free, open source
- Community ratings/reviews

**Premium Plugin Marketplaces:**

- CodeCanyon, WooCommerce, etc.
- Commercial plugins
- Support and updates

**Django Packages:**

- djangopackages.org
- Searchable, categorized
- Comparison tools

### 13.8 Common Plugin Types

**Functionality Plugins:**

- SEO tools
- Contact forms
- Social media integration
- Analytics

**Content Plugins:**

- Page builders
- Gallery/slider plugins
- Custom post types

**Performance Plugins:**

- Caching
- Image optimization
- Minification

**Security Plugins:**

- Firewall
- Malware scanning
- Two-factor auth

**Responsibilities:**

- Enable extensibility without modifying core
- Provide stable APIs and hooks
- Support plugin ecosystem
- Manage dependencies and versions
- Ensure security and sandboxing
- Facilitate plugin discovery

---

## 14. API Layer: Programmatic Access

Expose application functionality via REST, GraphQL, or RPC APIs.

### 14.1 REST API Design

**Resource-Based URLs:**
GET    /api/articles           # List articles
GET    /api/articles/:id       # Get single article
POST   /api/articles           # Create article
PUT    /api/articles/:id       # Update article (full)
PATCH  /api/articles/:id       # Update article (partial)
DELETE /api/articles/:id       # Delete article

**Django REST Framework:**
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        # Filter by query param
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        return queryset

**Serializers:**
from rest_framework import serializers

class ArticleSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    tag_names = serializers.ListField(source='tags', read_only=True)

    class Meta:
        model = Article
        fields = ['id', 'title', 'body', 'author', 'tag_names', 'published_at']
        read_only_fields = ['id', 'published_at']

    def validate_title(self, value):
        if len(value) < 5:
            raise serializers.ValidationError("Title too short")
        return value

### 14.2 API Authentication

**Token Authentication:**

# Django REST Framework

from rest_framework.authentication import TokenAuthentication

class ArticleViewSet(viewsets.ModelViewSet):
    authentication_classes = [TokenAuthentication]

# Request header

# Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b

**JWT Authentication:**
from rest_framework_simplejwt.authentication import JWTAuthentication

# Request header

# Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc

**OAuth2:**

- Authorization code flow
- Client credentials
- Scopes for fine-grained permissions

**API Keys:**

# Custom authentication

class APIKeyAuthentication(BaseAuthentication):
    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_API_KEY')
        if not api_key:
            return None

        try:
            user = User.objects.get(api_key=api_key)
            return (user, None)
        except User.DoesNotExist:
            raise AuthenticationFailed('Invalid API key')

### 14.3 API Versioning

**URL Path Versioning:**
/api/v1/articles
/api/v2/articles

**Header Versioning:**
Accept: application/vnd.myapi.v2+json

**Query Parameter:**
/api/articles?version=2

**Implementation:**

# Django REST Framework

REST_FRAMEWORK = {
    'DEFAULT_VERSIONING_CLASS': 'rest_framework.versioning.URLPathVersioning',
    'DEFAULT_VERSION': 'v1',
    'ALLOWED_VERSIONS': ['v1', 'v2'],
}

# In viewset

def get_serializer_class(self):
    if self.request.version == 'v2':
        return ArticleSerializerV2
    return ArticleSerializer

### 14.4 GraphQL APIs

**Schema Definition:**

# Graphene (Python)

import graphene
from graphene_django import DjangoObjectType

class ArticleType(DjangoObjectType):
    class Meta:
        model = Article
        fields = ['id', 'title', 'body', 'author', 'published_at']

class Query(graphene.ObjectType):
    articles = graphene.List(ArticleType)
    article = graphene.Field(ArticleType, id=graphene.Int())

    def resolve_articles(self, info):
        return Article.objects.all()

    def resolve_article(self, info, id):
        return Article.objects.get(id=id)

schema = graphene.Schema(query=Query)

**Query Example:**
query {
  articles {
    id
    title
    author {
      username
    }
  }
}

**Mutations:**
class CreateArticle(graphene.Mutation):
    class Arguments:
        title = graphene.String(required=True)
        body = graphene.String()

    article = graphene.Field(ArticleType)

    def mutate(self, info, title, body):
        article = Article.objects.create(
            title=title,
            body=body,
            author=info.context.user
        )
        return CreateArticle(article=article)

class Mutation(graphene.ObjectType):
    create_article = CreateArticle.Field()

### 14.5 API Documentation

**OpenAPI/Swagger:**

# Django REST Framework + drf-spectacular

from drf_spectacular.utils import extend_schema

class ArticleViewSet(viewsets.ModelViewSet):
    @extend_schema(
        summary="List all articles",
        description="Returns paginated list of articles",
        responses={200: ArticleSerializer(many=True)}
    )
    def list(self, request):
        ...

# Auto-generated docs at /api/docs/

**GraphQL Schema Introspection:**

- Built-in schema documentation
- GraphQL Playground, GraphiQL
- Type exploration

### 14.6 Rate Limiting

**Throttling:**

# Django REST Framework

from rest_framework.throttling import UserRateThrottle

class ArticleViewSet(viewsets.ModelViewSet):
    throttle_classes = [UserRateThrottle]

# settings.py

REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_RATES': {
        'user': '100/hour',
        'anon': '20/hour',
    }
}

**Custom Rate Limits:**
class BurstRateThrottle(UserRateThrottle):
    scope = 'burst'
    rate = '10/min'  # Short burst

class SustainedRateThrottle(UserRateThrottle):
    scope = 'sustained'
    rate = '1000/day'  # Daily limit

### 14.7 Pagination

**Page Number Pagination:**
GET /api/articles?page=2
Response: {
  "count": 100,
  "next": "/api/articles?page=3",
  "previous": "/api/articles?page=1",
  "results": [...]
}

**Cursor Pagination:**

- Efficient for large datasets
- Consistent results even with new data
- Opaque cursor token

GET /api/articles?cursor=cD0yMDIx

**Limit/Offset:**
GET /api/articles?limit=25&offset=50

### 14.8 API Best Practices

**Filtering:**
GET /api/articles?status=published&author=123

**Sorting:**
GET /api/articles?ordering=-published_at,title

**Field Selection (Sparse Fieldsets):**
GET /api/articles?fields=id,title,author.username

**Embedding Related Resources:**
GET /api/articles?include=author,tags

**Error Responses:**
{
  "error": {
    "code": "validation_error",
    "message": "Title is required",
    "details": {
      "title": ["This field is required."]
    }
  }
}

**CORS Headers:**
CORS_ALLOWED_ORIGINS = [
    "https://example.com",
    "https://app.example.com",
]

**Responsibilities:**

- Expose functionality programmatically
- Support multiple clients (web, mobile, third-party)
- Provide authentication and authorization
- Version APIs for backward compatibility
- Document APIs comprehensively
- Rate limit and throttle
- Enable efficient data fetching

---

## 15. Configuration & Environment Management

Manage settings, secrets, and environment-specific configuration.

### 15.1 Configuration Layers

**Hierarchy:**

1. Default settings (code)
    ↓
2. Environment-specific settings (dev/stage/prod)
    ↓
3. Environment variables
    ↓
4. Runtime configuration (database, admin UI)

### 15.2 Settings Files

**Django:**

# settings/base.py - Shared settings

DEBUG = False
INSTALLED_APPS = [...]

# settings/development.py

from .base import *
DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# settings/production.py

from .base import *
DEBUG = False
ALLOWED_HOSTS = ['example.com', 'www.example.com']
SECRET_KEY = os.environ['SECRET_KEY']

**Rails:**

# config/environments/development.rb

Rails.application.configure do
  config.cache_classes = false
  config.consider_all_requests_local = true
end

# config/environments/production.rb

Rails.application.configure do
  config.cache_classes = true
  config.consider_all_requests_local = false
  config.force_ssl = true
end

### 15.3 Environment Variables

**12-Factor App Principles:**

- Store config in environment
- Strict separation of config from code
- Never commit secrets to version control

**Usage:**

# Django

import os
from pathlib import Path

SECRET_KEY = os.environ['SECRET_KEY']
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
DATABASE_URL = os.environ['DATABASE_URL']

**.env Files (Development):**

# .env

SECRET_KEY=mysecretkey
DEBUG=True
DATABASE_URL=postgresql://localhost/mydb
REDIS_URL=redis://localhost:6379/0

**python-decouple:**
from decouple import config

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)
DATABASE_URL = config('DATABASE_URL')

### 15.4 Secret Management

**Development:**

- `.env` files (not committed)
- Local environment variables

**Production:**

- AWS Secrets Manager
- Google Cloud Secret Manager
- Azure Key Vault
- HashiCorp Vault
- Environment variables (Heroku, Railway)

**Secret Rotation:**

- Automatic rotation for DB passwords, API keys
- Zero-downtime rotation
- Audit logs

### 15.5 Feature Flags

**Enable/disable features without deployment:**

# Simple flag

if settings.FEATURE_NEW_DASHBOARD:
    return new_dashboard_view(request)
else:
    return old_dashboard_view(request)

# django-waffle

from waffle import flag_is_active

if flag_is_active(request, 'new_dashboard'):
    ...

**Progressive Rollout:**

- Enable for 10% of users
- Enable for specific users/groups
- A/B testing

**Feature Flag Services:**

- LaunchDarkly
- Flagsmith
- Unleash
- Split.io

### 15.6 Multi-Tenancy Configuration

**Tenant-Specific Settings:**

# Different DB per tenant

DATABASES = {
    'tenant_1': {...},
    'tenant_2': {...},
}

# Route to correct DB

class TenantRouter:
    def db_for_read(self, model, **hints):
        return get_current_tenant().database_name

**Domain-Based Tenancy:**

# tenant1.example.com → Tenant 1

# tenant2.example.com → Tenant 2

### 15.7 Logging Configuration

**Logging Levels:**

- DEBUG - Detailed diagnostic info
- INFO - General informational messages
- WARNING - Warning messages
- ERROR - Error messages
- CRITICAL - Critical errors

**Django Logging:**
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': 'app.log',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
        },
        'myapp': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
        },
    },
}

**Structured Logging:**
import structlog

logger = structlog.get_logger()
logger.info("user_login", user_id=123, ip_address="192.168.1.1")

# Output: {"event": "user_login", "user_id": 123, "ip_address": "192.168.1.1"}

### 15.8 Monitoring Configuration

**Application Performance Monitoring (APM):**

- New Relic
- DataDog
- Sentry (error tracking)
- Scout APM

**Configuration:**

# Sentry

import sentry_sdk
sentry_sdk.init(
    dsn=os.environ['SENTRY_DSN'],
    environment=os.environ['ENV'],
    traces_sample_rate=1.0,
)

**Metrics:**

- Prometheus + Grafana
- StatsD
- Custom metrics endpoints

**Responsibilities:**

- Separate configuration from code
- Manage secrets securely
- Enable environment-specific behavior
- Support feature flags and experimentation
- Configure logging and monitoring
- Enable multi-tenancy where needed

---

## 16. Deployment & Infrastructure Layer

How application code is packaged, deployed, and run in production.

### 16.1 Application Servers & Processes

**Process Types (Procfile):**
web: gunicorn myapp.wsgi --workers 4 --bind 0.0.0.0:8000
worker: celery -A myapp worker --loglevel=info
beat: celery -A myapp beat --loglevel=info

**Process Managers:**

- systemd (Linux services)
- Supervisor
- Foreman (development)

### 16.2 Web Server Architecture

**Production Stack:**
Internet
    ↓
Load Balancer (AWS ELB, Nginx)
    ↓
Reverse Proxy (Nginx, Apache)
    ↓
Application Server (Gunicorn, Uvicorn, Puma)
    ↓
Django/Rails/Express App

**Nginx Configuration:**
upstream app_server {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
}

server {
    listen 80;
    server_name example.com;

    location /static/ {
        alias /var/www/myapp/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://app_server;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

### 16.3 Containerization

**Dockerfile:**
FROM python:3.11-slim

WORKDIR /app

# Install dependencies

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application

COPY . .

# Collect static files

RUN python manage.py collectstatic --noinput

# Run migrations and start server

CMD ["sh", "-c", "python manage.py migrate && gunicorn myapp.wsgi:application --bind 0.0.0.0:8000"]

**Docker Compose (Development):**
version: '3.8'

services:
  web:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: myapp
      POSTGRES_PASSWORD: secret
  
  redis:
    image: redis:7
  
  worker:
    build: .
    command: celery -A myapp worker
    depends_on:
      - db
      - redis

### 16.4 Database Migrations

**Pre-Deployment:**

# Run migrations before deploying new code

python manage.py migrate --noinput

# Rails

rails db:migrate

**Zero-Downtime Migrations:**

1. Add new column (nullable)
2. Deploy code that writes to both old and new
3. Backfill data
4. Deploy code that only uses new column
5. Drop old column

### 16.5 Static Asset Pipeline

**Django Static Files:**

# Collect static files to STATIC_ROOT

python manage.py collectstatic --noinput

# Upload to S3/CDN

aws s3 sync staticfiles/ s3://mybucket/static/ --acl public-read

**Webpack/Vite Build:**
npm run build

# Outputs to dist/ or build/

**CDN Configuration:**

# Django with S3

AWS_STORAGE_BUCKET_NAME = 'mybucket'
AWS_S3_CUSTOM_DOMAIN = 'd123456.cloudfront.net'
STATIC_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/static/'

### 16.6 Deployment Strategies

**Rolling Deployment:**

- Deploy to servers one at a time
- Always some servers running old version
- No downtime

**Blue-Green Deployment:**

- Two identical environments (blue and green)
- Deploy to green, test, switch traffic
- Instant rollback

**Canary Deployment:**

- Deploy to small subset of servers
- Monitor metrics
- Gradually increase if successful

**Continuous Deployment Pipeline:**

# .github/workflows/deploy.yml

name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: pytest
      - name: Build Docker image
        run: docker build -t myapp .
      - name: Push to registry
        run: docker push myapp:latest
      - name: Deploy to Kubernetes
        run: kubectl apply -f k8s/

### 16.7 Scaling Strategies

**Horizontal Scaling:**

- Add more application servers
- Load balancer distributes traffic
- Stateless app servers

**Vertical Scaling:**

- Increase CPU/RAM of servers
- Limited by hardware

**Database Scaling:**

- Read replicas for read-heavy loads
- Sharding for write-heavy loads
- Connection pooling (PgBouncer)

**Caching:**

- Redis/Memcached for hot data
- CDN for static assets
- Full page caching

**Auto-Scaling:**

# Kubernetes HPA

apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:

- type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70

### 16.8 Monitoring & Observability

**The Three Pillars:**

**Logs:**

- Application logs (errors, requests)
- Centralized logging (ELK, Splunk, CloudWatch)
- Structured logging (JSON)

**Metrics:**

- Request rate, latency, error rate
- Resource usage (CPU, memory, disk)
- Business metrics (signups, orders)

**Traces:**

- Distributed tracing (Jaeger, Zipkin)
- Track requests across services
- Identify bottlenecks

**Alerting:**

# Prometheus alert

alert: HighErrorRate
expr: rate(http_requests_total{status="500"}[5m]) > 0.05
for: 5m
annotations:
  summary: "High error rate detected"

### 16.9 Backup & Disaster Recovery

**Database Backups:**

- Automated daily backups
- Point-in-time recovery
- Off-site storage

**Application State:**

- User uploads backed up to S3
- Redis persistence (RDB/AOF)

**Disaster Recovery Plan:**

- RTO (Recovery Time Objective)
- RPO (Recovery Point Objective)
- Documented runbooks

**Responsibilities:**

- Package and deploy application code
- Serve static assets efficiently
- Scale to handle load
- Monitor system health
- Ensure high availability
- Enable rollbacks and disaster recovery
- Automate deployment pipeline

---

## 17. Testing Layer

Ensure code quality, correctness, and reliability.

### 17.1 Testing Pyramid

        /\
       /E2E\      ← Few, slow, expensive
      /------\
     /Integr.\   ← Moderate number
    /----------\
   /   Unit     \ ← Many, fast, cheap
  /--------------\

### 17.2 Unit Tests

**Test individual functions/methods in isolation.**

**Django Example:**
from django.test import TestCase
from .models import Article

class ArticleModelTest(TestCase):
    def setUp(self):
        self.article = Article.objects.create(
            title='Test Article',
            body='Test body'
        )

    def test_str_representation(self):
        self.assertEqual(str(self.article), 'Test Article')

    def test_slug_generation(self):
        self.assertEqual(self.article.slug, 'test-article')

    def test_is_published(self):
        self.assertFalse(self.article.is_published())
        self.article.status = 'published'
        self.assertTrue(self.article.is_published())

**Run Tests:**
python manage.py test
pytest  # Alternative test runner

### 17.3 Integration Tests

**Test multiple components together.**

**View Integration Test:**
from django.test import TestCase, Client
from django.contrib.auth.models import User

class ArticleViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('testuser', password='pass')

    def test_article_list_view(self):
        response = self.client.get('/articles/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'articles/list.html')

    def test_create_article_requires_auth(self):
        response = self.client.post('/articles/create/', {
            'title': 'New Article',
            'body': 'Content'
        })
        self.assertEqual(response.status_code, 302)  # Redirect to login

        # Login and try again
        self.client.login(username='testuser', password='pass')
        response = self.client.post('/articles/create/', {
            'title': 'New Article',
            'body': 'Content'
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Article.objects.filter(title='New Article').exists())

### 17.4 API Tests

**Django REST Framework:**
from rest_framework.test import APITestCase
from rest_framework import status

class ArticleAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('test', password='pass')

    def test_list_articles(self):
        response = self.client.get('/api/articles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_article_requires_auth(self):
        response = self.client.post('/api/articles/', {
            'title': 'New Article',
            'body': 'Content'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticate
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/articles/', {
            'title': 'New Article',
            'body': 'Content'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

### 17.5 End-to-End (E2E) Tests

**Test entire user workflows in browser.**

**Selenium (Python):**
from selenium import webdriver
from selenium.webdriver.common.by import By

class E2ETest(TestCase):
    def setUp(self):
        self.browser = webdriver.Chrome()

    def tearDown(self):
        self.browser.quit()

    def test_user_can_create_article(self):
        # Login
        self.browser.get('http://localhost:8000/login/')
        self.browser.find_element(By.NAME, 'username').send_keys('testuser')
        self.browser.find_element(By.NAME, 'password').send_keys('pass')
        self.browser.find_element(By.CSS_SELECTOR, 'button[type=submit]').click()

        # Create article
        self.browser.get('http://localhost:8000/articles/create/')
        self.browser.find_element(By.NAME, 'title').send_keys('E2E Article')
        self.browser.find_element(By.NAME, 'body').send_keys('Content')
        self.browser.find_element(By.CSS_SELECTOR, 'button[type=submit]').click()

        # Verify
        self.assertIn('E2E Article', self.browser.page_source)

**Playwright / Cypress (JavaScript):**
// Cypress
describe('Article Creation', () => {
  it('allows user to create article', () => {
    cy.visit('/login')
    cy.get('input[name=username]').type('testuser')
    cy.get('input[name=password]').type('pass')
    cy.get('button[type=submit]').click()

    cy.visit('/articles/create')
    cy.get('input[name=title]').type('E2E Article')
    cy.get('textarea[name=body]').type('Content')
    cy.get('button[type=submit]').click()

    cy.contains('E2E Article')
  })
})

### 17.6 Test Fixtures & Factories

**Fixtures (JSON/YAML):**
[
  {
    "model": "auth.user",
    "pk": 1,
    "fields": {
      "username": "testuser",
      "email": "test@example.com"
    }
  },
  {
    "model": "articles.article",
    "pk": 1,
    "fields": {
      "title": "Test Article",
      "author": 1
    }
  }
]

**Factory Boy (Python):**
import factory
from .models import Article, User

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda obj: f'{obj.username}@example.com')

class ArticleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Article

    title = factory.Faker('sentence')
    body = factory.Faker('text')
    author = factory.SubFactory(UserFactory)

# Usage in tests

article = ArticleFactory(title='Custom Title')
articles = ArticleFactory.create_batch(10)  # Create 10

### 17.7 Mocking & Stubbing

**Mock External Dependencies:**
from unittest.mock import patch, MagicMock

class ExternalAPITest(TestCase):
    @patch('myapp.services.requests.get')
    def test_fetch_data(self, mock_get):
        # Mock response
        mock_response = MagicMock()
        mock_response.json.return_value = {'data': 'test'}
        mock_get.return_value = mock_response

        # Call code that uses requests.get
        result = fetch_external_data()

        # Verify
        self.assertEqual(result, {'data': 'test'})
        mock_get.assert_called_once_with('https://api.example.com/data')

### 17.8 Test Coverage

**Measure code coverage:**

# Python

coverage run --source='.' manage.py test
coverage report
coverage html  # Generate HTML report

# JavaScript

npm test -- --coverage

**Coverage Goals:**

- 80%+ overall coverage
- 100% for critical paths
- Focus on meaningful tests, not just coverage numbers

### 17.9 Continuous Integration (CI)

**GitHub Actions:**
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: 3.11
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run tests
        run: pytest --cov
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost/test

### 17.10 Performance Testing

**Load Testing:**

# Apache Bench

ab -n 1000 -c 10 <http://localhost:8000/api/articles/>

# Locust (Python)

locust -f locustfile.py --host=<http://localhost:8000>

**Locustfile:**
from locust import HttpUser, task

class ArticleUser(HttpUser):
    @task
    def view_articles(self):
        self.client.get("/articles/")

    @task(3)  # 3x more likely
    def view_single_article(self):
        self.client.get("/articles/1/")

**Responsibilities:**

- Ensure code correctness
- Catch regressions early
- Enable refactoring with confidence
- Document expected behavior
- Maintain test suite efficiency
- Integrate with CI/CD pipeline

---

## 18. Security Layer: Defense in Depth

Cross-cutting security measures at every level.

### 18.1 Input Validation & Sanitization

**Never Trust User Input:**

# Django form validation

from django import forms

class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ['title', 'body', 'tags']

    def clean_title(self):
        title = self.cleaned_data['title']
        if len(title) < 5:
            raise forms.ValidationError("Title too short")
        # Strip dangerous characters
        return bleach.clean(title)

**SQL Injection Prevention:**

# ✅ GOOD - Parameterized queries (ORM handles it)

Article.objects.filter(title=user_input)

# ❌ BAD - String concatenation

Article.objects.raw(f"SELECT * FROM articles WHERE title = '{user_input}'")

# ✅ GOOD - Even with raw SQL, use params

Article.objects.raw("SELECT * FROM articles WHERE title = %s", [user_input])

### 18.2 Cross-Site Scripting (XSS) Prevention

**Output Escaping:**
{# Django templates auto-escape #}
{{ user_comment }}  {# <script>alert('xss')</script> → &lt;script&gt;... #}

{# Mark as safe only if you control the content #}
{{ safe_html_content|safe }}

**Content Security Policy (CSP):**

# Django CSP middleware

CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "<https://cdn.example.com>")
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'")
CSP_IMG_SRC = ("'self'", "data:", "https:")

### 18.3 Cross-Site Request Forgery (CSRF) Prevention

**CSRF Tokens:**
<form method="post">
    {% csrf_token %}
    <input type="text" name="title">
    <button type="submit">Submit</button>
</form>

**Django automatically validates token on POST/PUT/DELETE.**

**API CSRF (Double Submit Cookie):**

# For AJAX requests

from django.middleware.csrf import get_token
csrf_token = get_token(request)

# Send in header

headers = {'X-CSRFToken': csrf_token}

### 18.4 Authentication Security

**Password Hashing:**

# Django uses PBKDF2 by default

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',  # Best
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
]

**Session Security:**

# Force HTTPS for session cookies

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True  # No JS access
SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection
SESSION_COOKIE_AGE = 1209600  # 2 weeks

**Brute Force Protection:**

# Rate limit login attempts

from django_ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m', method='POST')
def login_view(request):
    if getattr(request, 'limited', False):
        return HttpResponse('Too many attempts', status=429)
    ...

### 18.5 Authorization Security

**Principle of Least Privilege:**

# Only give permissions needed

def article_edit_view(request, article_id):
    article = get_object_or_404(Article, id=article_id)

    # Check ownership
    if article.author != request.user:
        raise PermissionDenied

    # Or check permission
    if not request.user.has_perm('articles.change_article'):
        raise PermissionDenied

**Object-Level Permissions:**

# django-guardian

from guardian.shortcuts import assign_perm, get_objects_for_user

# Only author can edit

assign_perm('change_article', article.author, article)

# Get articles user can edit

editable_articles = get_objects_for_user(
    request.user,
    'articles.change_article'
)

### 18.6 API Security

**Token Security:**

# Use strong random tokens

import secrets
token = secrets.token_urlsafe(32)

# JWT - verify signature

from rest_framework_simplejwt.authentication import JWTAuthentication

# Automatically validates signature, expiry

**Rate Limiting:**

# Prevent abuse

REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day'
    }
}

### 18.7 Database Security

**Connection Security:**

# Force SSL for database connections

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'OPTIONS': {
            'sslmode': 'require',
        }
    }
}

**Principle of Least Privilege:**

- Application DB user has only needed permissions
- No DROP, CREATE USER, etc.
- Read-only user for analytics

### 18.8 Infrastructure Security

**HTTPS Everywhere:**

# Django

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

**Security Headers:**

# Django security middleware

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'  # Prevent clickjacking

**Secrets Management:**

- Never commit secrets to git
- Use environment variables
- Rotate credentials regularly
- Use secret management services

### 18.9 Dependency Security

**Keep Dependencies Updated:**

# Check for vulnerabilities

pip-audit
npm audit
bundle audit  # Ruby

**Dependency Scanning in CI:**

# GitHub Actions

- name: Security scan
  run: |
    pip install pip-audit
    pip-audit

### 18.10 Security Monitoring

**Logging Security Events:**
import logging
security_logger = logging.getLogger('security')

# Log failed login attempts

security_logger.warning(
    'Failed login attempt',
    extra={
        'username': username,
        'ip': request.META['REMOTE_ADDR']
    }
)

**Intrusion Detection:**

- Failed login attempts
- Permission denied errors
- Unusual activity patterns

**Security Audits:**

- Regular penetration testing
- Code security reviews
- Dependency vulnerability scans

**Responsibilities:**

- Validate and sanitize all input
- Prevent injection attacks (SQL, XSS, etc.)
- Secure authentication and sessions
- Enforce authorization consistently
- Protect APIs with rate limiting and tokens
- Secure infrastructure and dependencies
- Monitor and log security events

---

## Summary: The Complete Stack

An **Application Operating System** is a comprehensive, layered software platform that abstracts web infrastructure into a cohesive development environment. The anatomy consists of:

1. **Foundation Layer** - Runtime, application server, HTTP handling
2. **Request/Response Layer** - Core abstractions, middleware pipeline
3. **Routing Layer** - URL-to-handler mapping
4. **Controller/View Layer** - Request processing logic
5. **Domain/Data Layer** - Models, ORM, business logic
6. **Authentication & Authorization** - Identity, access control, RBAC
7. **Caching Layer** - Performance optimization
8. **Presentation Layer** - Templating, rendering, i18n
9. **Background Jobs** - Asynchronous processing
10. **Search & Indexing** - Full-text search, filtering
11. **Admin & Management** - Built-in tooling, CLI
12. **Plugin/Extension** - Third-party extensibility
13. **API Layer** - REST/GraphQL interfaces
14. **Configuration** - Environment management, secrets
15. **Deployment** - Infrastructure, scaling, monitoring
16. **Testing** - Quality assurance
17. **Security** - Defense in depth

Each layer builds on the ones below it, providing increasing abstraction while maintaining clear extension points. The system manages the complete lifecycle from HTTP request to database to response, handling cross-cutting concerns (auth, caching, security) uniformly across the stack.

This architecture enables developers to focus on business logic while the platform handles infrastructure complexity—just as traditional operating systems abstract hardware, application operating systems abstract the web.

---

## References

This document synthesizes patterns from Django, WordPress, Ruby on Rails, Laravel, Express.js, and other major web application platforms, representing industry best practices as of 2025.
