# The Anatomy of an Application Operating System

A comprehensive technical reference defining the complete layered architecture of web application platforms (frameworks, CMS, and full-stack systems).

> **Note:** This document describes the generic Application Operating System pattern. **Echelon** is an implementation of this pattern built on Deno. See `RuntimeLayer.md` for Echelon-specific architecture details.

---

## Executive Summary

An **Application Operating System** (App OS) is a layered software platform that abstracts web infrastructure into domain-specific primitives, managing the entire lifecycle from HTTP request to response while providing extension points, resource management, and developer tooling. Like traditional operating systems abstract hardware, App OS platforms abstract the web stack—servers, databases, auth, rendering—into reusable components and conventions.

This document defines the **complete anatomy** of these systems using Django, WordPress, Rails, and similar platforms as reference implementations.

---

## 1. Foundation Layer: Runtime & Execution Environment

The lowest layer that interfaces with the actual compute environment.

### 1.1 Language Runtime

- **Interpreter/VM**: Python, PHP, Ruby, Node.js, JVM
- **Memory management**: Garbage collection, heap allocation
- **Concurrency model**: Threads, event loops, async/await
- **Standard library**: Core data structures, I/O primitives

### 1.2 Application Server Interface

- **Protocol adapters**:
  - WSGI (Web Server Gateway Interface) - Python standard
  - ASGI (Asynchronous Server Gateway Interface) - Python async
  - Rack - Ruby standard
  - PHP-FPM - FastCGI Process Manager
  - Node.js HTTP/HTTPS modules
- **Process management**: Workers, threads, process pools
- **Server implementations**:
  - Gunicorn, uWSGI, Uvicorn (Python)
  - Puma, Unicorn (Ruby)
  - Apache mod_php, PHP-FPM (PHP)
  - Node.js cluster module

### 1.3 HTTP Request Reception

- **Socket handling**: Accept connections, read headers/body
- **Protocol parsing**: HTTP/1.1, HTTP/2, HTTP/3
- **TLS termination**: Often handled by reverse proxy (Nginx, Apache)
- **Connection pooling**: Reuse connections, manage timeouts

**Responsibilities:**

- Bridge between OS network stack and application code
- Normalize raw HTTP into framework-specific request objects
- Handle low-level concerns (keep-alive, chunked encoding, etc.)

---

## 2. Request/Response Layer: Core Abstractions

First framework-specific layer—wraps raw HTTP into rich objects.

### 2.1 Request Object

Unified interface representing incoming HTTP request:

**Core attributes:**

- `method` - GET, POST, PUT, DELETE, PATCH, etc.
- `path` - URL path component
- `query_params` - Parsed query string
- `headers` - Request headers (normalized)
- `body` - Request body (raw bytes)
- `cookies` - Parsed cookie jar
- `session` - Stateful session data
- `user` - Authenticated user object (if authenticated)
- `files` - Uploaded files (multipart/form-data)
- `META` / `env` - Server environment variables

**Computed properties:**

- `is_ajax` / `is_json` - Content-type detection
- `is_secure` - HTTPS check
- `host` - Domain/hostname
- `client_ip` - Real client IP (accounting for proxies)

### 2.2 Response Object

Unified interface for building HTTP responses:

**Core attributes:**

- `status_code` - HTTP status (200, 404, 500, etc.)
- `headers` - Response headers
- `body` / `content` - Response payload
- `content_type` - MIME type
- `cookies` - Set-Cookie directives
- `charset` - Character encoding

**Helper methods:**

- `set_cookie()` - Add cookie with options
- `redirect()` - 301/302 redirects
- `json()` - JSON serialization with proper headers
- `render()` - Template rendering shortcut

### 2.3 Streaming & Chunked Responses

- Generator-based streaming (Python)
- Stream interfaces for large files
- Server-sent events (SSE) support
- WebSocket upgrade handling (if supported)

**Responsibilities:**

- Normalize HTTP variations across servers
- Provide consistent developer interface
- Handle encoding/decoding automatically
- Enable testability (mock request/response)

---

## 3. Middleware Layer: Request/Response Pipeline

Cross-cutting concerns that wrap every request/response cycle.

### 3.1 Middleware Chain Architecture

**Onion model**: Each middleware wraps the next, forming nested layers.

Request → MW1 → MW2 → MW3 → Controller → MW3 → MW2 → MW1 → Response

Middleware can:

- Inspect/modify request before controller
- Short-circuit and return early response
- Inspect/modify response after controller
- Handle exceptions at any point

### 3.2 Common Middleware Components

**Security Middleware:**

- **CSRF Protection**: Token generation/validation
- **XSS Protection**: Set X-XSS-Protection headers
- **Clickjacking Protection**: X-Frame-Options, CSP headers
- **HSTS**: HTTP Strict Transport Security
- **Content Security Policy (CSP)**: Restrict resource loading

**Session Middleware:**

- Session creation/loading from cookie or header
- Session persistence to backend (DB, cache, file)
- Session expiry and cleanup
- Cookie-based or token-based sessions

**Authentication Middleware:**

- Load user from session/token
- Attach `request.user` object
- Handle anonymous users
- Token validation (JWT, API keys)

**CORS Middleware:**

- Cross-Origin Resource Sharing headers
- Preflight OPTIONS handling
- Allowed origins whitelist

**Compression Middleware:**

- Gzip/Brotli response compression
- Content-type filtering
- Size thresholds

**Caching Middleware:**

- HTTP caching headers (ETag, Last-Modified, Cache-Control)
- Page-level caching
- Cache invalidation hooks

**Logging & Monitoring Middleware:**

- Request/response logging
- Performance timing
- Error tracking (Sentry, Rollbar)
- Metrics collection (Prometheus, StatsD)

**Content Negotiation:**

- Accept header parsing
- Format-specific responses (JSON, XML, HTML)
- Language negotiation (i18n)

**Rate Limiting:**

- Request counting per IP/user
- Throttle limits
- 429 Too Many Requests responses

### 3.3 Middleware Configuration

- **Ordering matters**: Security before auth, auth before controller
- **Conditional middleware**: Apply only to certain routes/patterns
- **Custom middleware**: Framework hooks for extensions

**Examples:**

- Django: `MIDDLEWARE` setting, ordered list
- Rails: Rack middleware stack
- Express: `app.use()` chain
- Laravel: HTTP kernel middleware groups

**Responsibilities:**

- Handle cross-cutting concerns without polluting business logic
- Provide extension points for plugins
- Enable composition of features
- Maintain separation of concerns

---

## 4. Routing Layer: URL Resolution

Maps incoming request URLs to application code.

### 4.1 Route Definition Systems

**Explicit Configuration (Django, Laravel):**

# Django URLconf

urlpatterns = [
    path('articles/<int:year>/', views.year_archive),
    path('api/users/<uuid:id>/', api.user_detail),
]

**Convention-based (Rails, Next.js):**

# Rails routes

resources :articles do
  resources :comments
end

# Generates: GET /articles/:id, POST /articles, etc

**Filesystem-based (Next.js, SvelteKit):**
pages/
  index.js          → /
  about.js          → /about
  blog/
    [slug].js       → /blog/:slug

**Decorator/Annotation-based (Flask, FastAPI):**
@app.route('/users/<int:user_id>')
def get_user(user_id):
    ...

### 4.2 Route Components

**Pattern Matching:**

- Static segments: `/about`, `/api/v1`
- Dynamic segments: `/<username>`, `/:id`
- Type converters: `<int:id>`, `<uuid:token>`, `<slug:article>`
- Regex patterns: `r'^articles/(?P<year>[0-9]{4})/$'`
- Wildcards: `*` (greedy), `**` (path segments)

**HTTP Method Binding:**

- GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
- Method-specific handlers
- Automatic OPTIONS/HEAD handling

**Route Metadata:**

- Route names (for reverse URL generation)
- Middleware/guards per route
- Rate limit configuration
- Cache policies
- RBAC requirements

**Nested/Hierarchical Routes:**

- Nested resources: `/blogs/:blog_id/posts/:post_id`
- Route groups with shared prefixes/middleware
- Sub-application mounting

### 4.3 URL Generation (Reverse Routing)

**Named routes:**

# Django

url = reverse('article-detail', kwargs={'id': 123})

# Rails

article_path(@article)  # → /articles/123

**Benefits:**

- Refactor URLs without breaking links
- Type-safe URL generation
- DRY principle for URLs

### 4.4 Route Resolution Algorithm

1. **Normalize request path**: Strip trailing slash (optional), lowercase (optional)
2. **Match patterns in order**: First match wins (or most specific)
3. **Extract path parameters**: Capture dynamic segments
4. **Type conversion**: Convert `'123'` → `123` for `<int:id>`
5. **Method check**: Ensure HTTP method allowed
6. **Return handler**: Controller/view function + extracted params

### 4.5 Advanced Routing Features

**Content Negotiation Routing:**

- Different handlers for JSON vs HTML requests
- Version routing: `/api/v1/users` vs `/api/v2/users`

**Domain/Subdomain Routing:**

# Different apps per subdomain

if request.host == 'api.example.com':
    route to API app
elif request.host == 'admin.example.com':
    route to admin app

**Internationalization (i18n) Routing:**

- Language prefixes: `/en/about`, `/fr/about`
- Auto-detection from Accept-Language header

**API Versioning:**

- Path-based: `/api/v1/`, `/api/v2/`
- Header-based: `Accept: application/vnd.api.v2+json`
- Query param: `?version=2`

**Responsibilities:**

- Map URLs to handlers efficiently
- Extract structured data from URLs
- Enable clean, RESTful URL design
- Support URL generation/reversing
- Provide extension points for custom routing logic

---

## 5. Controller/View Layer: Request Handling Logic

The application logic that processes requests and coordinates responses.

### 5.1 Controller Types

**Function-Based Controllers:**

# Django function view

def article_detail(request, article_id):
    article = get_object_or_404(Article, id=article_id)
    return render(request, 'article.html', {'article': article})

**Class-Based Controllers:**

# Django class-based view

class ArticleDetailView(DetailView):
    model = Article
    template_name = 'article.html'

**RESTful Resource Controllers:**

# Rails resource controller

class ArticlesController < ApplicationController
  def index; end    # GET /articles
  def show; end     # GET /articles/:id
  def create; end   # POST /articles
  def update; end   # PATCH /articles/:id
  def destroy; end  # DELETE /articles/:id
end

### 5.2 Controller Responsibilities

**Request Processing:**

- Extract and validate input (params, body, files)
- Authenticate and authorize user
- Parse and validate request formats

**Business Logic Orchestration:**

- Call service layer / business logic
- Coordinate multiple models/services
- Handle transactions
- Manage side effects (emails, jobs, etc.)

**Response Generation:**

- Select appropriate response format (HTML, JSON, XML)
- Render templates with data
- Set status codes and headers
- Handle redirects

### 5.3 Common Controller Patterns

**CRUD Operations:**

- **Create**: Validate input, create record, redirect/respond
- **Read**: Fetch record(s), render view
- **Update**: Validate, update record, respond
- **Delete**: Confirm, delete record, redirect

**Form Handling:**
if request.method == 'POST':
    form = ArticleForm(request.POST)
    if form.is_valid():
        form.save()
        return redirect('article-list')
else:
    form = ArticleForm()
return render(request, 'form.html', {'form': form})

**Pagination:**
articles = Article.objects.all()
paginator = Paginator(articles, 25)
page = paginator.get_page(request.GET.get('page'))

**Search/Filtering:**
query = request.GET.get('q')
articles = Article.objects.filter(title__icontains=query)

### 5.4 Generic Controller Classes

Pre-built controllers for common patterns:

**Django Generic Views:**

- `ListView` - Display list of objects
- `DetailView` - Display single object
- `CreateView` - Handle object creation form
- `UpdateView` - Handle object update form
- `DeleteView` - Handle object deletion
- `TemplateView` - Render static template

**Rails Concerns:**

- Mixins for shared controller behavior
- `before_action` filters
- Rescue handlers for exceptions

### 5.5 API Controllers

**REST API Patterns:**

# Django REST Framework

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

**GraphQL Resolvers:**
def resolve_article(root, info, id):
    return Article.objects.get(id=id)

**Serialization:**

- Convert models to JSON/XML
- Include/exclude fields
- Nested serialization
- Field transformation

### 5.6 Controller Testing

- Unit tests with mock requests
- Integration tests with test client
- Fixtures and factories
- Request/response assertions

**Responsibilities:**

- Implement application-specific logic
- Coordinate between layers (models, services, views)
- Handle input validation and output formatting
- Maintain thin controllers (delegate to services)
- Provide clear API contracts

---

## 6. Domain/Data Layer: Models & Business Logic

The core domain objects and data persistence abstractions.

### 6.1 Object-Relational Mapping (ORM)

**Model Definition:**

# Django ORM

class Article(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    published_at = models.DateTimeField(auto_now_add=True)
    tags = models.ManyToManyField(Tag)

    class Meta:
        ordering = ['-published_at']
        indexes = [models.Index(fields=['published_at'])]

**ActiveRecord (Rails):**
class Article < ApplicationRecord
  belongs_to :author, class_name: 'User'
  has_many :comments
  validates :title, presence: true, length: { maximum: 200 }
end

**TypeORM (Node.js/TypeScript):**
@Entity()
class Article {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  title: string;
  
  @ManyToOne(() => User)
  author: User;
}

### 6.2 Field Types & Validation

**Common Field Types:**

- **Strings**: `CharField`, `TextField`, `EmailField`, `URLField`, `SlugField`
- **Numbers**: `IntegerField`, `BigIntegerField`, `FloatField`, `DecimalField`
- **Dates/Times**: `DateField`, `DateTimeField`, `TimeField`, `DurationField`
- **Binary**: `BinaryField`, `FileField`, `ImageField`
- **Boolean**: `BooleanField`, `NullBooleanField`
- **JSON**: `JSONField` (Postgres, MySQL 5.7+)
- **Enums**: `CharField(choices=...)` or native enum support

**Relationships:**

- **One-to-Many**: `ForeignKey` (many articles → one author)
- **Many-to-Many**: `ManyToManyField` (articles ↔ tags)
- **One-to-One**: `OneToOneField` (user ↔ profile)

**Field Constraints:**

- `unique=True` - Unique constraint
- `db_index=True` - Create index
- `null=True` - Allow NULL in DB
- `blank=True` - Allow empty in forms
- `default` - Default value
- `choices` - Enum-like constraints

**Validation:**

- Built-in validators (email, URL, min/max length, regex)
- Custom field validators
- Model-level validation (`clean()` method)
- Database-level constraints

### 6.3 Query API

**Basic Queries:**

# Retrieve all

Article.objects.all()

# Filter

Article.objects.filter(author=user, published_at__year=2024)

# Get single object

Article.objects.get(id=123)

# Exclude

Article.objects.exclude(status='draft')

# Order

Article.objects.order_by('-published_at', 'title')

# Limit/offset

Article.objects.all()[0:10]  # First 10

# Count

Article.objects.filter(status='published').count()

# Exists

Article.objects.filter(title='Test').exists()

**Advanced Queries:**

# Joins / select_related (eager loading)

Article.objects.select_related('author').all()

# Prefetch many-to-many

Article.objects.prefetch_related('tags').all()

# Aggregation

from django.db.models import Count, Avg
Article.objects.aggregate(avg_comments=Avg('comments__count'))

# Annotation

Article.objects.annotate(comment_count=Count('comments'))

# Q objects (complex lookups)

from django.db.models import Q
Article.objects.filter(Q(status='published') | Q(author=user))

# Raw SQL (escape hatch)

Article.objects.raw('SELECT * FROM articles WHERE ...')

**Field Lookups:**

- `exact`, `iexact` (case-insensitive)
- `contains`, `icontains`, `startswith`, `endswith`
- `gt`, `gte`, `lt`, `lte` (comparisons)
- `in` (IN clause)
- `isnull` (NULL checks)
- `year`, `month`, `day` (date extraction)
- `regex`, `iregex` (regex matching)

### 6.4 Transactions & Atomicity

**Transaction Management:**

# Django

from django.db import transaction

@transaction.atomic
def create_article_with_tags(data):
    article = Article.objects.create(**data)
    article.tags.add(*tag_ids)
    # Both succeed or both rollback

**Savepoints:**
with transaction.atomic():
    # Outer transaction

    try:
        with transaction.atomic():
            # Inner savepoint
            risky_operation()
    except Exception:
        # Rollback to savepoint, continue outer
        pass

**Manual Transaction Control:**
transaction.set_autocommit(False)
try:
    # Operations
    transaction.commit()
except:
    transaction.rollback()

### 6.5 Database Migrations

**Migration System:**

- Detect model changes (fields added/removed/changed)
- Generate migration files (Python/Ruby code)
- Apply migrations to database
- Rollback support
- Schema history tracking

**Migration Operations:**

- `CreateModel`, `DeleteModel`, `RenameModel`
- `AddField`, `RemoveField`, `AlterField`, `RenameField`
- `AddIndex`, `RemoveIndex`
- `AlterUniqueTogether`, `AlterIndexTogether`
- `RunSQL`, `RunPython` (custom migrations)

**Workflow:**

# Django

python manage.py makemigrations  # Generate migrations
python manage.py migrate         # Apply migrations
python manage.py showmigrations  # Show status

# Rails

rails generate migration AddTitleToArticles title:string
rails db:migrate
rails db:rollback

### 6.6 Database Abstraction

**Multi-Database Support:**

- PostgreSQL, MySQL, SQLite, Oracle, SQL Server
- Database routers for read/write splitting
- Sharding configuration

**Connection Pooling:**

- Persistent connections
- Connection limits
- Timeout configuration

**Query Optimization:**

- Query logging and profiling
- `select_related` / `prefetch_related` to avoid N+1
- Database query caching
- Index hints

### 6.7 Non-Relational Data

**Document Stores (MongoDB via ODM):**

# MongoEngine

class Article(Document):
    title = StringField(required=True)
    body = StringField()
    metadata = DictField()  # Schemaless

**Key-Value Stores:**

- Redis integration for cache, sessions, queues
- Direct key-value access, not ORM-style

**Full-Text Search:**

- PostgreSQL full-text search
- Elasticsearch integration
- Whoosh (Python), Solr, Algolia

### 6.8 Model Hooks & Signals

**Lifecycle Hooks:**

# Django signals

from django.db.models.signals import pre_save, post_save

@receiver(post_save, sender=Article)
def article_saved(sender, instance, created, **kwargs):
    if created:
        send_notification(instance)

**Common Hooks:**

- `pre_save`, `post_save`
- `pre_delete`, `post_delete`
- `m2m_changed` (many-to-many changes)

**Rails Callbacks:**
class Article < ApplicationRecord
  before_save :normalize_title
  after_create :notify_subscribers
  around_update :log_changes
end

### 6.9 Business Logic Organization

**Fat Models vs Thin Models:**

**Fat Models (traditional):**

- Put business logic in model methods
- Models know how to validate, compute, and persist themselves

**Thin Models + Service Layer (modern):**

- Models are data + simple validation
- Services coordinate complex operations
- Commands/interactors for business logic

# Service layer example

class ArticlePublishService:
    def **init**(self, article):
        self.article = article

    def publish(self):
        self.article.status = 'published'
        self.article.published_at = timezone.now()
        self.article.save()
        self.send_notifications()
        self.update_search_index()
    
    def send_notifications(self):
        # Email subscribers
        pass

**Responsibilities:**

- Define domain entities and relationships
- Abstract database operations
- Enforce data integrity and validation
- Provide query interfaces
- Manage schema evolution
- Encapsulate business rules

---

## 7. Authentication & Authorization (AuthN/AuthZ)

Identity, access control, and security enforcement.

### 7.1 Authentication Layer

**User Model:**

# Django built-in User

from django.contrib.auth.models import User

# Custom User

class User(AbstractBaseUser):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

**Authentication Backends:**

**Session-based (Traditional Web):**

1. User submits credentials (username/password)
2. Backend validates against database
3. Session ID stored in cookie
4. Subsequent requests authenticated via session

# Django

from django.contrib.auth import authenticate, login

def login_view(request):
    user = authenticate(username=username, password=password)
    if user:
        login(request, user)

**Token-based (APIs):**

- JWT (JSON Web Tokens)
- OAuth2 tokens
- API keys

# Django REST Framework JWT

{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}

**OAuth2 / Social Auth:**

- Login with Google, GitHub, Facebook
- Authorization code flow
- PKCE for mobile apps
- `python-social-auth`, `allauth` (Django)

**Multi-Factor Authentication (MFA):**

- TOTP (Time-based One-Time Password) - Google Authenticator
- SMS codes
- Hardware tokens (YubiKey)
- Backup codes

### 7.2 Password Management

**Hashing:**

- **Never store plaintext passwords**
- Use bcrypt, Argon2, PBKDF2, scrypt
- Salt + hash
- Configurable work factor (iterations)

# Django password hashing

from django.contrib.auth.hashers import make_password, check_password

hashed = make_password('mypassword')  # → 'pbkdf2_sha256$...'
check_password('mypassword', hashed)  # → True

**Password Policies:**

- Minimum length
- Complexity requirements
- Password history (no reuse)
- Expiration policies
- Breach detection (HaveIBeenPwned API)

**Password Reset:**

1. User requests reset
2. Generate unique token, send email
3. Token valid for limited time
4. User sets new password via token link

### 7.3 Authorization Layer (RBAC - Role-Based Access Control)

**Permission Model:**

**Django Permissions:**

# Automatic per-model permissions

article.add_article
article.change_article
article.delete_article
article.view_article

# Custom permissions

class Article(models.Model):
    class Meta:
        permissions = [
            ("publish_article", "Can publish articles"),
            ("feature_article", "Can feature articles"),
        ]

**Checking Permissions:**

# In view

if not request.user.has_perm('article.publish_article'):
    return HttpResponseForbidden()

# Decorator

from django.contrib.auth.decorators import permission_required

@permission_required('article.publish_article')
def publish_view(request, article_id):
    ...

**Role/Group System:**

# Groups bundle permissions

editors = Group.objects.create(name='Editors')
editors.permissions.add(publish_perm, feature_perm)

# Assign user to group

user.groups.add(editors)

# Check

if user.groups.filter(name='Editors').exists():
    ...

### 7.4 Object-Level Permissions

**Row-level security:**

# django-guardian

from guardian.shortcuts import assign_perm, get_objects_for_user

# Give user permission on specific article

assign_perm('change_article', user, article)

# Get articles user can change

articles = get_objects_for_user(user, 'article.change_article')

**Ownership-based:**

# Only author can edit their own articles

if article.author != request.user:
    return HttpResponseForbidden()

**Policy Classes:**

# Rails Pundit

class ArticlePolicy
  def update?
    user.admin? || record.author == user
  end
end

### 7.5 API Authentication

**Token Authentication:**

# Django REST Framework

from rest_framework.authentication import TokenAuthentication

class MyView(APIView):
    authentication_classes = [TokenAuthentication]

# Request header

# Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b

**JWT Authentication:**

# Stateless tokens with claims

{
  "user_id": 123,
  "username": "john",
  "exp": 1735862400,  # Expiry
  "iat": 1735858800   # Issued at
}

**OAuth2 Scopes:**

# Fine-grained permissions

Authorization: Bearer token
Scopes: read:articles write:comments

### 7.6 Session Management

**Session Backend Options:**

- **Database**: Store in sessions table
- **Cache**: Redis, Memcached (faster)
- **File**: Filesystem storage
- **Cookie**: Encrypted client-side storage

**Session Configuration:**

# Django settings

SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_COOKIE_AGE = 1209600  # 2 weeks
SESSION_COOKIE_SECURE = True  # HTTPS only
SESSION_COOKIE_HTTPONLY = True  # No JS access
SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection

**Session Operations:**

# Set data

request.session['cart_items'] = [1, 2, 3]

# Get data

cart = request.session.get('cart_items', [])

# Delete

del request.session['cart_items']

# Clear all

request.session.flush()

### 7.7 Security Middleware Integration

**CSRF Protection:**

- Generate unique token per session
- Require token in POST/PUT/DELETE forms
- Validate token on server
- Reject requests with invalid/missing tokens

**Rate Limiting:**

# Limit login attempts

from django_ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m')
def login_view(request):
    ...

**IP Whitelisting/Blacklisting:**

- Admin panel access restricted to office IPs
- Block known malicious IPs

**Responsibilities:**

- Verify user identity (authentication)
- Enforce access policies (authorization)
- Secure password storage and validation
- Manage sessions and tokens
- Protect against common attacks (CSRF, brute force)
- Provide audit trails

---

## 8. Caching Layer: Performance Optimization

Multi-level caching to reduce database load and improve response times.

### 8.1 Cache Architecture

**Cache Levels:**
Browser Cache (HTTP headers)
    ↓
CDN Cache (edge locations)
    ↓
Reverse Proxy Cache (Varnish, Nginx)
    ↓
Application Cache (App OS level)
    ↓
ORM Query Cache
    ↓
Database Query Cache

### 8.2 Application-Level Caching

**Cache Backends:**

- **Memcached**: Distributed memory cache, simple, fast
- **Redis**: In-memory data store, rich data types, persistence options
- **Database**: Use DB table as cache (slow, but simple)
- **Filesystem**: Store on disk (slow, but unlimited size)
- **Local Memory**: In-process cache (fast, not shared across workers)

**Configuration:**

# Django

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'myapp',
        'TIMEOUT': 300,  # 5 minutes default
    }
}

### 8.3 Cache Patterns

**Low-Level Cache API:**
from django.core.cache import cache

# Set

cache.set('my_key', 'my_value', timeout=300)

# Get

value = cache.get('my_key')
if value is None:
    value = expensive_computation()
    cache.set('my_key', value, timeout=300)

# Get or set

value = cache.get_or_set('my_key', expensive_computation, timeout=300)

# Delete

cache.delete('my_key')

# Clear all

cache.clear()

**Per-View Caching:**

# Django

from django.views.decorators.cache import cache_page

@cache_page(60 * 15)  # Cache for 15 minutes
def article_list(request):
    articles = Article.objects.all()
    return render(request, 'articles.html', {'articles': articles})

**Template Fragment Caching:**
{% load cache %}
{% cache 500 sidebar request.user.username %}
    ... expensive sidebar computation ...
{% endcache %}

**Query Result Caching:**

# Manual

cache_key = f'article_{article_id}'
article = cache.get(cache_key)
if not article:
    article = Article.objects.get(id=article_id)
    cache.set(cache_key, article, timeout=3600)

# With django-cachalot (automatic query caching)

article = Article.objects.get(id=article_id)  # Cached automatically

**Full Page Caching:**

- Cache entire rendered HTML pages
- Bypass application entirely for cache hits
- Used for static or rarely-changing pages

### 8.4 Cache Invalidation

**Time-based Expiration:**

- Set TTL (time-to-live) on cache entries
- Entries expire automatically after timeout

**Event-based Invalidation:**

# Django signals

from django.db.models.signals import post_save
from django.core.cache import cache

@receiver(post_save, sender=Article)
def invalidate_article_cache(sender, instance, **kwargs):
    cache.delete(f'article_{instance.id}')
    cache.delete('article_list')

**Cache Tags/Namespaces:**

# Group related keys

cache.set('article_1', data, tags=['articles'])
cache.set('article_2', data, tags=['articles'])

# Invalidate all articles

cache.delete_many(tags=['articles'])

**Version-based Invalidation:**

# Increment version to invalidate

CACHE_VERSION = 2  # Bump to invalidate all old entries
cache.set('my_key', value, version=CACHE_VERSION)

### 8.5 Distributed Caching

**Cache Consistency:**

- **Cache-aside**: App checks cache, fetches from DB on miss, updates cache
- **Write-through**: Write to cache and DB simultaneously
- **Write-behind**: Write to cache immediately, async write to DB
- **Refresh-ahead**: Proactively refresh before expiration

**Cache Stampede Prevention:**
import time

def get_article_with_lock(article_id):
    cache_key = f'article_{article_id}'
    lock_key = f'{cache_key}_lock'

    # Try cache
    article = cache.get(cache_key)
    if article:
        return article
    
    # Acquire lock
    if cache.add(lock_key, 'locked', timeout=10):
        # This process rebuilds cache
        article = Article.objects.get(id=article_id)
        cache.set(cache_key, article, timeout=3600)
        cache.delete(lock_key)
        return article
    else:
        # Another process is rebuilding, wait
        time.sleep(0.1)
        return get_article_with_lock(article_id)

### 8.6 HTTP Caching

**Cache-Control Headers:**
from django.views.decorators.cache import cache_control

@cache_control(max_age=3600, public=True)
def article_view(request, id):
    ...

**ETag Support:**
from django.views.decorators.http import condition

def etag_func(request, article_id):
    article = Article.objects.get(id=article_id)
    return hashlib.md5(str(article.updated_at).encode()).hexdigest()

@condition(etag_func=etag_func)
def article_view(request, article_id):
    ...

# Returns 304 Not Modified if ETag matches

**Vary Headers:**
from django.views.decorators.vary import vary_on_headers

@vary_on_headers('Accept-Language', 'Cookie')
def article_view(request):
    # Cache separately per language and user
    ...

### 8.7 CDN Integration

**Static Asset Caching:**

- Serve CSS, JS, images from CDN
- Long cache times (1 year+)
- Cache busting via versioned filenames

# Django static files

STATIC_URL = '<https://cdn.example.com/static/>'
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'

# Generates: style.abc123.css (hash-based versioning)

**Page Caching at Edge:**

- CloudFlare, Fastly, AWS CloudFront
- Cache HTML pages at edge locations
- Purge cache via API on content update

### 8.8 Cache Monitoring

**Metrics to Track:**

- Hit rate (hits / (hits + misses))
- Miss rate
- Eviction rate
- Memory usage
- Connection pool saturation

**Tools:**

- Redis CLI: `INFO stats`
- Memcached: `stats` command
- Application monitoring (New Relic, DataDog)

**Responsibilities:**

- Reduce database load
- Improve response times
- Scale read-heavy workloads
- Manage cache invalidation complexity
- Provide multiple cache strategies
- Support distributed caching

---

## 9. Presentation Layer: Templating & Rendering

Transforms domain data into user-facing formats (HTML, JSON, XML).

### 9.1 Template Engine Architecture

**Server-Side Templating:**

- Template files with embedded logic/variables
- Compile templates to executable code
- Render with context data
- Return HTML string

**Common Template Engines:**

- Django Template Language (DTL)
- Jinja2 (Python)
- ERB (Embedded Ruby)
- Blade (Laravel/PHP)
- Twig (Symfony/PHP)
- EJS, Pug (Node.js)

### 9.2 Template Syntax

**Variable Output:**
{# Django #}
{{ article.title }}
{{ article.published_at|date:"Y-m-d" }}
{{ user.username|upper }}

**Control Flow:**
{% if user.is_authenticated %}
    Welcome, {{ user.username }}!
{% else %}
    Please log in.
{% endif %}

{% for article in articles %}
    <h2>{{ article.title }}</h2>
{% empty %}
    <p>No articles found.</p>
{% endfor %}

**Template Inheritance:**
{# base.html #}
<!DOCTYPE html>
<html>
<head>
    <title>{% block title %}My Site{% endblock %}</title>
</head>
<body>
    <header>{% include "header.html" %}</header>
    <main>{% block content %}{% endblock %}</main>
    <footer>{% include "footer.html" %}</footer>
</body>
</html>

{# article.html #}
{% extends "base.html" %}

{% block title %}{{ article.title }}{% endblock %}

{% block content %}
    <article>{{ article.body }}</article>
{% endblock %}

**Template Inclusion:**
{% include "partials/comment.html" with comment=comment %}

### 9.3 Template Filters & Tags

**Built-in Filters:**
{{ text|lower }}              {# Lowercase #}
{{ text|truncatewords:30 }}   {# Truncate #}
{{ date|date:"Y-m-d" }}        {# Format date #}
{{ value|default:"N/A" }}      {# Default if empty #}
{{ html|safe }}                {# Mark as safe HTML #}
{{ list|join:", " }}           {# Join list #}
{{ number|floatformat:2 }}     {# Format float #}

**Custom Filters:**

# Django

from django import template
register = template.Library()

@register.filter
def markdown(value):
    import markdown
    return markdown.markdown(value)

# Usage: {{ article.body|markdown|safe }}

**Custom Tags:**
@register.simple_tag
def current_time(format_string):
    return datetime.now().strftime(format_string)

# Usage: {% current_time "%Y-%m-%d %H:%M" %}

### 9.4 Context Processors

**Global Template Context:**

# Django context processor

def site_settings(request):
    return {
        'site_name': 'My Site',
        'current_year': datetime.now().year,
        'user': request.user,
    }

# Available in all templates

{{ site_name }}  {# My Site #}

### 9.5 Template Security

**Auto-Escaping:**
{# Automatic HTML escaping #}
{{ user_input }}  {# <script>alert('xss')</script> → &lt;script&gt;... #}

{# Mark as safe (use carefully) #}
{{ html_content|safe }}

{# Escape in JavaScript context #}
<script>var name = "{{ name|escapejs }}";</script>

**CSRF Tokens:**
<form method="post">
    {% csrf_token %}
    <input type="text" name="title">
    <button type="submit">Submit</button>
</form>

### 9.6 Asset Management

**Static Files:**

# Django

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'  # Collected files for production

**Template Usage:**
{% load static %}
<link rel="stylesheet" href="{% static 'css/style.css' %}">
<img src="{% static 'img/logo.png' %}" alt="Logo">

**Media Files (User Uploads):**
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

<img src="{{ article.image.url }}" alt="{{ article.title }}">

### 9.7 Modern Frontend Integration

**Webpack/Vite Integration:**

- Bundle JavaScript modules
- Process CSS (SASS, PostCSS)
- Optimize images
- Generate manifest.json for cache busting

# Django + webpack

{% load render_bundle from webpack_loader %}
{% render_bundle 'main' 'css' %}
{% render_bundle 'main' 'js' %}

**Component-Based Templates:**

- Template components with slots/props
- Reusable UI components
- Similar to Vue/React components but server-rendered

### 9.8 API Response Rendering

**JSON Serialization:**

# Django

from django.http import JsonResponse

def api_article_list(request):
    articles = Article.objects.all()
    data = [
        {
            'id': a.id,
            'title': a.title,
            'author': a.author.username,
        }
        for a in articles
    ]
    return JsonResponse({'articles': data})

**Django REST Framework Serializers:**
from rest_framework import serializers

class ArticleSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source='author.username')

    class Meta:
        model = Article
        fields = ['id', 'title', 'body', 'author', 'published_at']

**Content Negotiation:**

# Return HTML or JSON based on Accept header

def article_list(request):
    articles = Article.objects.all()

    if request.accepts('application/json'):
        return JsonResponse({'articles': list(articles.values())})
    else:
        return render(request, 'articles.html', {'articles': articles})

### 9.9 Internationalization (i18n)

**Translation Strings:**
{% load i18n %}

<h1>{% trans "Welcome" %}</h1>
<p>{% blocktrans count counter=articles.count %}
    There is {{ counter }} article.
{% plural %}
    There are {{ counter }} articles.
{% endblocktrans %}</p>

**Message Files:**

# In code

from django.utils.translation import gettext as _
message =_("Welcome to our site")

# Generate .po files

python manage.py makemessages -l fr

# Translate strings in locale/fr/LC_MESSAGES/django.po

python manage.py compilemessages

**Locale Selection:**

- Browser Accept-Language header
- User preference in profile
- URL prefix (`/en/`, `/fr/`)
- Cookie or session

**Responsibilities:**

- Separate presentation from business logic
- Enable designer/developer collaboration
- Provide security (auto-escaping)
- Support template reuse and inheritance
- Manage static and media assets
- Enable internationalization
- Support multiple output formats (HTML, JSON, XML)

---

## 10. Background Job System: Asynchronous Processing

Handle long-running tasks outside the request/response cycle.

### 10.1 Task Queue Architecture

**Components:**
Producer (Web App)
    ↓ (enqueue task)
Message Broker (Redis, RabbitMQ, SQS)
    ↓ (distribute tasks)
Workers (Background Processes)
    ↓ (execute tasks)
Result Backend (Redis, DB)

### 10.2 Task Queue Systems

**Celery (Python):**

# tasks.py

from celery import shared_task

@shared_task
def send_welcome_email(user_id):
    user = User.objects.get(id=user_id)
    send_mail(
        'Welcome!',
        f'Hello {user.username}',
        '<from@example.com>',
        [user.email],
    )

# Usage in view

from .tasks import send_welcome_email
send_welcome_email.delay(user.id)  # Async execution

**Sidekiq (Ruby):**
class WelcomeEmailWorker
  include Sidekiq::Worker
  
  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome_email(user).deliver_now
  end
end

# Usage

WelcomeEmailWorker.perform_async(user.id)

**Bull (Node.js):**
const Queue = require('bull');
const emailQueue = new Queue('email', 'redis://localhost:6379');

emailQueue.process(async (job) => {
  await sendEmail(job.data.userId);
});

// Enqueue
emailQueue.add({ userId: 123 });

### 10.3 Message Brokers

**Redis:**

- In-memory, fast
- Simple pub/sub
- Persistence optional
- Good for most use cases

**RabbitMQ:**

- Full-featured message broker
- AMQP protocol
- Complex routing, exchanges
- Guaranteed delivery

**Amazon SQS:**

- Managed queue service
- High availability
- Pay per use
- Serverless

### 10.4 Task Patterns

**Fire-and-Forget:**

# Send email asynchronously

send_email.delay(user_id)

# Returns immediately, email sent in background

**Scheduled Tasks:**
from celery.schedules import crontab

# Periodic task

@app.task
def cleanup_old_sessions():
    Session.objects.filter(expire_date__lt=now()).delete()

# Schedule

app.conf.beat_schedule = {
    'cleanup-sessions': {
        'task': 'tasks.cleanup_old_sessions',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2am
    },
}

**Delayed Execution:**

# Execute task in 1 hour

send_reminder.apply_async(args=[user_id], countdown=3600)

# Execute at specific time

from datetime import datetime, timedelta
eta = datetime.now() + timedelta(hours=24)
send_reminder.apply_async(args=[user_id], eta=eta)

**Task Chaining:**
from celery import chain

# Execute tasks sequentially

workflow = chain(
    download_file.s(url),
    process_file.s(),
    upload_result.s()
)
workflow.apply_async()

**Parallel Execution:**
from celery import group

# Execute tasks in parallel

job = group([
    process_chunk.s(chunk)
    for chunk in data_chunks
])
result = job.apply_async()

### 10.5 Task Management

**Retry Logic:**
@shared_task(bind=True, max_retries=3)
def fetch_data(self, url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        # Exponential backoff: 1min, 2min, 4min
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

**Task Timeouts:**
@shared_task(time_limit=300, soft_time_limit=240)
def long_running_task():
    # Hard limit: 300 seconds (raises exception)
    # Soft limit: 240 seconds (raises SoftTimeLimitExceeded, can catch)
    ...

**Task Priority:**

# High priority queue

send_alert.apply_async(priority=9)

# Low priority queue

generate_report.apply_async(priority=0)

### 10.6 Result Handling

**Retrieving Results:**

# Synchronous wait

result = expensive_computation.delay(x, y)
output = result.get(timeout=10)  # Blocks until done

# Check status

if result.ready():
    output = result.result

**Result Backends:**

- Redis (fast, common)
- Database (persistent)
- RabbitMQ (limited)
- Elasticsearch (searchable)

### 10.7 Monitoring & Observability

**Celery Flower (Web UI):**

- Task history
- Worker status
- Task rates
- Real-time monitoring
- Task detail inspection

**Metrics:**

- Tasks per second
- Success/failure rate
- Average task duration
- Queue length
- Worker utilization

**Logging:**
import logging
logger = logging.getLogger(**name**)

@shared_task
def my_task():
    logger.info("Task started")
    # Work
    logger.info("Task completed")

### 10.8 Common Use Cases

**Email Sending:**

- Welcome emails
- Password resets
- Newsletters
- Notifications

**Image Processing:**

- Thumbnail generation
- Image optimization
- Format conversion
- Watermarking

**Data Processing:**

- Report generation
- CSV exports
- Data imports
- ETL pipelines

**API Integrations:**

- Third-party API calls
- Webhook deliveries
- Payment processing
- Analytics tracking

**Scheduled Maintenance:**

- Database cleanup
- Cache warming
- Sitemap generation
- Backup tasks

**Responsibilities:**

- Move long-running tasks out of request cycle
- Enable parallel processing
- Provide retry and error handling
- Support scheduled/periodic tasks
- Scale independently from web workers
- Ensure reliability and monitoring

---

## 11. Search & Indexing Layer

Full-text search, filtering, and content discovery.

### 11.1 Database Full-Text Search

**PostgreSQL Full-Text Search:**

# Django

from django.contrib.postgres.search import SearchVector, SearchQuery

# Simple search

Article.objects.filter(title__search='django')

# Multi-field search

Article.objects.annotate(
    search=SearchVector('title', 'body')
).filter(search='django')

# Ranked search

from django.contrib.postgres.search import SearchRank
Article.objects.annotate(
    rank=SearchRank(SearchVector('title', 'body'), SearchQuery('django'))
).order_by('-rank')

**MySQL Full-Text Search:**
-- Requires FULLTEXT index
CREATE FULLTEXT INDEX article_search ON articles(title, body);

SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('django' IN NATURAL LANGUAGE MODE);

### 11.2 Dedicated Search Engines

**Elasticsearch:**

- Distributed, RESTful search engine
- Built on Apache Lucene
- Near real-time indexing
- Complex queries, aggregations, faceting
- Scalable, resilient

**Integration Example (Python):**
from elasticsearch import Elasticsearch
es = Elasticsearch(['localhost:9200'])

# Index document

es.index(
    index='articles',
    id=article.id,
    document={
        'title': article.title,
        'body': article.body,
        'author': article.author.username,
        'published_at': article.published_at,
    }
)

# Search

result = es.search(
    index='articles',
    body={
        'query': {
            'multi_match': {
                'query': 'django',
                'fields': ['title^2', 'body'],  # Boost title
            }
        }
    }
)

**Apache Solr:**

- Similar to Elasticsearch
- Schema-based (more structured)
- Powerful faceting
- Enterprise features

**Algolia / Typesense / Meilisearch:**

- SaaS search solutions
- Typo-tolerance
- Instant search (autocomplete)
- Easy integration
- Analytics

### 11.3 Search Features

**Fuzzy Matching:**

# Elasticsearch

{
    'query': {
        'fuzzy': {
            'title': {
                'value': 'djanggo',  # Typo
                'fuzziness': 'AUTO'
            }
        }
    }
}

**Autocomplete / Search-as-you-type:**

# Edge n-grams for prefix matching

{
    'query': {
        'match_phrase_prefix': {
            'title': 'djang'  # Matches "django"
        }
    }
}

**Faceted Search:**

# Filter by category, date range, etc

{
    'aggs': {
        'categories': {
            'terms': {'field': 'category'}
        },
        'date_histogram': {
            'date_histogram': {
                'field': 'published_at',
                'interval': 'month'
            }
        }
    }
}

**Highlighting:**

# Return snippets with matched terms highlighted

{
    'highlight': {
        'fields': {
            'body': {}
        }
    }
}

# Result: "...learn <em>Django</em> framework..."

**Boosting / Relevance Tuning:**

# Boost recent articles

{
    'query': {
        'function_score': {
            'query': {'match': {'title': 'django'}},
            'functions': [
                {
                    'gauss': {
                        'published_at': {
                            'scale': '30d',
                            'decay': 0.5
                        }
                    }
                }
            ]
        }
    }
}

### 11.4 Indexing Strategies

**Real-Time Indexing:**

# Django signal

from django.db.models.signals import post_save

@receiver(post_save, sender=Article)
def index_article(sender, instance, **kwargs):
    es.index(index='articles', id=instance.id, document=instance.to_dict())

**Bulk Indexing:**

# Initial index or reindex

from elasticsearch.helpers import bulk

actions = [
    {
        '_index': 'articles',
        '_id': article.id,
        '_source': article.to_dict()
    }
    for article in Article.objects.all()
]
bulk(es, actions)

**Periodic Reindexing:**

# Celery periodic task

@app.task
def reindex_articles():
    # Full reindex to fix inconsistencies
    ...

### 11.5 Search UI Patterns

**Search Page:**

- Search input
- Filters (facets)
- Results list
- Pagination
- Sort options

**Autocomplete Dropdown:**

- Live suggestions as user types
- Show categories or result types
- Keyboard navigation

**Instant Search:**

- Results update without page reload
- Filters applied instantly
- URL reflects search state

### 11.6 Search Analytics

**Track:**

- Search queries
- Zero-result searches (fix with synonyms)
- Click-through rates
- Search-to-conversion

**A/B Testing:**

- Test different relevance algorithms
- Measure impact on engagement

**Responsibilities:**

- Enable fast, relevant content discovery
- Support complex queries and filters
- Provide autocomplete and suggestions
- Scale to large datasets
- Maintain index consistency with database
- Optimize relevance and ranking

---

## 12. Admin & Management Layer

Built-in tooling for managing application data, configuration, and operations.

### 12.1 Admin Interface

**Django Admin:**

# admin.py

from django.contrib import admin
from .models import Article

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'status', 'published_at']
    list_filter = ['status', 'published_at']
    search_fields = ['title', 'body']
    prepopulated_fields = {'slug': ('title',)}
    date_hierarchy = 'published_at'
    ordering = ['-published_at']

    # Custom actions
    actions = ['make_published']
    
    def make_published(self, request, queryset):
        queryset.update(status='published')
    make_published.short_description = "Publish selected articles"

**Features:**

- Auto-generated CRUD UI from models
- Customizable list/detail views
- Inline editing for related models
- Bulk actions
- Permissions integration
- Audit logging

**Rails Admin (via gems like RailsAdmin, ActiveAdmin):**
ActiveAdmin.register Article do
  permit_params :title, :body, :status
  
  index do
    selectable_column
    id_column
    column :title
    column :author
    column :status
    actions
  end
  
  filter :title
  filter :status
end

**WordPress wp-admin:**

- Posts, pages, media library
- User management
- Theme and plugin editors
- Settings panels
- Built-in, core feature

### 12.2 Management Commands (CLI)

**Django Management Commands:**

# management/commands/import_articles.py

from django.core.management.base import BaseCommand

class Command(BaseCommand):
    help = 'Import articles from CSV'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str)
    
    def handle(self, *args, **options):
        import csv
        with open(options['csv_file']) as f:
            reader = csv.DictReader(f)
            for row in reader:
                Article.objects.create(**row)
        self.stdout.write(self.style.SUCCESS('Import complete'))

**Usage:**
python manage.py import_articles data.csv

**Rails Rake Tasks:**

# lib/tasks/import.rake

namespace :articles do
  desc "Import articles from CSV"
  task import: :environment do
    CSV.foreach('data.csv', headers: true) do |row|
      Article.create!(row.to_hash)
    end
  end
end

rails articles:import

### 12.3 Common Admin Operations

**Data Migration:**

- Import/export CSV, JSON, XML
- Bulk updates
- Data transformations

**User Management:**

- Create/edit/delete users
- Assign roles and permissions
- Password resets
- Impersonate users (admin debugging)

**Content Moderation:**

- Approve/reject user-generated content
- Flag inappropriate content
- Bulk moderation actions

**Configuration:**

- Site settings (name, logo, contact info)
- Feature flags
- Third-party API keys
- Email templates

**System Monitoring:**

- View logs
- Check job queue status
- Cache statistics
- Database query performance

### 12.4 Audit Logging

**Track Changes:**

# django-auditlog

from auditlog.models import LogEntry

# Automatic logging

LogEntry.objects.get_for_object(article)

# Returns: [<LogEntry: Article #123 updated>, <LogEntry: Article #123 created>]

**Log Fields:**

- Who (user)
- What (model, action)
- When (timestamp)
- Changes (field diffs)
- IP address
- Request metadata

**Use Cases:**

- Compliance (GDPR, HIPAA)
- Debugging
- Revert changes
- Security investigations

### 12.5 System Health & Diagnostics

**Health Check Endpoints:**

# Django

def health_check(request):
    # Check DB
    try:
        Article.objects.count()
        db_status = 'ok'
    except Exception:
        db_status = 'error'

    # Check cache
    try:
        cache.set('health', 'ok', 1)
        cache.get('health')
        cache_status = 'ok'
    except Exception:
        cache_status = 'error'
    
    return JsonResponse({
        'status': 'ok' if db_status == cache_status == 'ok' else 'degraded',
        'database': db_status,
        'cache': cache_status,
    })

**Performance Metrics:**

- Request counts
- Response times (p50, p95, p99)
- Error rates
- Database query times

**Continued in ApplicationOperatingSystemContinued.md
**
