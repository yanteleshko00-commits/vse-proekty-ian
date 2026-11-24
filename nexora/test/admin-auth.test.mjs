import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {passwordConfigured,checkAdminPassword,createAdminSession,validAdminSession,allowAdminAttempt} from '../admin-auth.js';
const salt='a'.repeat(48),hash=salt+':'+crypto.scryptSync('test-only',salt,64).toString('hex');
test('admin passwords are hashed and fail closed',()=>{assert.equal(passwordConfigured(hash),true);assert.equal(checkAdminPassword('test-only',hash),true);assert.equal(checkAdminPassword('incorrect',hash),false);assert.equal(checkAdminPassword('test-only',''),false);});
test('admin session is independent of email, signed and expires',()=>{const now=Date.now(),token=createAdminSession(hash,now);assert.equal(validAdminSession(token,hash,now),true);assert.equal(validAdminSession(token+'x',hash,now),false);assert.equal(validAdminSession(token,hash,now+8*3600*1000),false);assert.equal(validAdminSession(token,'',now),false);});
test('admin password attempts are throttled',()=>{for(let i=0;i<5;i++)assert.equal(allowAdminAttempt('unit-test'),true);assert.equal(allowAdminAttempt('unit-test'),false);});
