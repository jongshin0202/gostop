// The bootstrap access key itself is never committed. This file contains only a salted PBKDF2 verifier.
// After the first login, the key can be rotated from the admin console; the rotated verifier is stored in the AccountStore Durable Object.
export const ADMIN_BOOTSTRAP=Object.freeze({
  salt:'d9dc4b2d24bec0e8625f41266414ad0e',
  hash:'67c732498ea925759522c59baeb9d9344c59506e7fd4cb9d86c3da75c3e0760c',
  iterations:100000
});
