/**
 * User Aggregate Tests
 *
 * Tests for User aggregate and value objects.
 */

import { assertEquals, assertExists, assert, assertThrows } from 'jsr:@std/assert';
import { User } from '../../../src/contexts/iam/domain/aggregates/user.ts';
import { Email } from '../../../src/contexts/iam/domain/value_objects/email.ts';
import { UserRole } from '../../../src/contexts/iam/domain/value_objects/user_role.ts';

// ============================================================================
// Email Value Object Tests
// ============================================================================

Deno.test('Email: should create valid email', () => {
  const email = Email.create('test@example.com');

  assertEquals(email.value, 'test@example.com');
  assertEquals(email.localPart, 'test');
  assertEquals(email.domain, 'example.com');
});

Deno.test('Email: should normalize email to lowercase', () => {
  const email = Email.create('TEST@EXAMPLE.COM');

  assertEquals(email.value, 'test@example.com');
});

Deno.test('Email: should reject invalid email', () => {
  assertThrows(
    () => Email.create('invalid-email'),
    Error,
    'Invalid email address'
  );

  assertThrows(
    () => Email.create('missing-at-symbol.com'),
    Error,
    'Invalid email address'
  );
});

Deno.test('Email: should check domain', () => {
  const email = Email.create('user@example.com');

  assert(email.isFromDomain('example.com'));
  assert(!email.isFromDomain('other.com'));
});

Deno.test('Email: should compare by value', () => {
  const email1 = Email.create('test@example.com');
  const email2 = Email.create('test@example.com');
  const email3 = Email.create('other@example.com');

  assert(email1.equals(email2));
  assert(!email1.equals(email3));
});

// ============================================================================
// UserRole Value Object Tests
// ============================================================================

Deno.test('UserRole: should create roles', () => {
  const owner = UserRole.owner();
  const admin = UserRole.admin();
  const member = UserRole.member();
  const guest = UserRole.guest();

  assertEquals(owner.value, 'owner');
  assertEquals(admin.value, 'admin');
  assertEquals(member.value, 'member');
  assertEquals(guest.value, 'guest');
});

Deno.test('UserRole: should compare privileges', () => {
  const owner = UserRole.owner();
  const admin = UserRole.admin();
  const member = UserRole.member();
  const guest = UserRole.guest();

  assert(owner.hasHigherPrivilegesThan(admin));
  assert(admin.hasHigherPrivilegesThan(member));
  assert(member.hasHigherPrivilegesThan(guest));

  assert(owner.hasSameOrHigherPrivilegesThan(owner));
  assert(owner.hasSameOrHigherPrivilegesThan(admin));
});

Deno.test('UserRole: should check role type', () => {
  const owner = UserRole.owner();
  const admin = UserRole.admin();
  const member = UserRole.member();
  const guest = UserRole.guest();

  assert(owner.isOwner());
  assert(!admin.isOwner());

  assert(owner.isAdminOrHigher());
  assert(admin.isAdminOrHigher());
  assert(!member.isAdminOrHigher());

  assert(owner.isMemberOrHigher());
  assert(admin.isMemberOrHigher());
  assert(member.isMemberOrHigher());
  assert(!guest.isMemberOrHigher());
});

// ============================================================================
// User Aggregate Tests
// ============================================================================

Deno.test('User: should register new user', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password',
    UserRole.member()
  );

  assertEquals(user.id, 'user-1');
  assertEquals(user.email.value, 'test@example.com');
  assertEquals(user.name, 'Test User');
  assertEquals(user.role.value, 'member');
  assertEquals(user.emailVerified, false);
  assertEquals(user.isActive, true);

  // Should have domain event
  assert(user.hasDomainEvents());
  const events = user.getDomainEvents();
  assertEquals(events.length, 1);
  assertEquals(events[0].eventType, 'UserRegistered');
});

Deno.test('User: should reject invalid name', () => {
  assertThrows(
    () => User.register('user-1', 'test@example.com', '', 'hashed-password'),
    Error,
    'Name must be at least 2 characters'
  );

  assertThrows(
    () => User.register('user-1', 'test@example.com', 'A', 'hashed-password'),
    Error,
    'Name must be at least 2 characters'
  );
});

Deno.test('User: should verify email', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password'
  );

  assertEquals(user.emailVerified, false);
  assertEquals(user.emailVerifiedAt, undefined);

  user.verifyEmail();

  assertEquals(user.emailVerified, true);
  assertExists(user.emailVerifiedAt);

  // Should have verification event
  const events = user.getDomainEvents();
  assertEquals(events.length, 2); // Registration + Verification
  assertEquals(events[1].eventType, 'EmailVerified');
});

Deno.test('User: should not verify email twice', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password'
  );

  user.verifyEmail();

  assertThrows(
    () => user.verifyEmail(),
    Error,
    'Email already verified'
  );
});

Deno.test('User: should change password', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'old-hash'
  );

  assertEquals(user.passwordHash, 'old-hash');

  user.changePassword('new-hash', 'user-1');

  assertEquals(user.passwordHash, 'new-hash');

  // Should have password changed event
  const events = user.getDomainEvents();
  assertEquals(events.length, 2); // Registration + Password change
  assertEquals(events[1].eventType, 'PasswordChanged');
});

Deno.test('User: should update profile', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Old Name',
    'hashed-password'
  );

  user.updateProfile('New Name');

  assertEquals(user.name, 'New Name');

  // Should have profile updated event
  const events = user.getDomainEvents();
  assertEquals(events.length, 2);
  assertEquals(events[1].eventType, 'UserProfileUpdated');
});

Deno.test('User: should update role', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password',
    UserRole.member()
  );

  assertEquals(user.role.value, 'member');

  user.updateRole(UserRole.admin());

  assertEquals(user.role.value, 'admin');
});

Deno.test('User: should record login', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password'
  );

  assertEquals(user.lastLoginAt, undefined);

  user.recordLogin();

  assertExists(user.lastLoginAt);
  assert(user.lastLoginAt instanceof Date);
});

Deno.test('User: should deactivate and reactivate', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password'
  );

  assertEquals(user.isActive, true);

  user.deactivate();
  assertEquals(user.isActive, false);

  user.reactivate();
  assertEquals(user.isActive, true);
});

Deno.test('User: should check admin permissions', () => {
  const owner = User.register('1', 'owner@example.com', 'Owner', 'hash', UserRole.owner());
  const admin = User.register('2', 'admin@example.com', 'Admin', 'hash', UserRole.admin());
  const member = User.register('3', 'member@example.com', 'Member', 'hash', UserRole.member());

  assert(owner.canPerformAdminActions());
  assert(admin.canPerformAdminActions());
  assert(!member.canPerformAdminActions());
});

Deno.test('User: should compare privileges', () => {
  const owner = User.register('1', 'owner@example.com', 'Owner', 'hash', UserRole.owner());
  const admin = User.register('2', 'admin@example.com', 'Admin', 'hash', UserRole.admin());

  assert(owner.hasHigherPrivilegesThan(admin));
  assert(!admin.hasHigherPrivilegesThan(owner));
});

Deno.test('User: should serialize to JSON', () => {
  const user = User.register(
    'user-1',
    'test@example.com',
    'Test User',
    'hashed-password',
    UserRole.member()
  );

  const json = user.toJSON();

  assertEquals(json.id, 'user-1');
  assertEquals(json.email, 'test@example.com');
  assertEquals(json.name, 'Test User');
  assertEquals(json.role, 'member');
  assertEquals(json.emailVerified, false);
  assertEquals(json.isActive, true);
  assertExists(json.createdAt);
  assertExists(json.updatedAt);
});
