import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { KnowledgeDoc, Role, User } from '@app/types';

const password = 'Passw0rd!';
const passwordHash = bcrypt.hashSync(password, 8);

export const users: User[] = [
  { id: 'u-employee', name: '李华', role: 'employee', email: 'lihua@example.com', phone: '13800000001', passwordHash },
  { id: 'u-hr', name: '王芳', role: 'hr', email: 'hr@example.com', phone: '13800000002', passwordHash },
  { id: 'u-mgmt', name: '刘总', role: 'management', email: 'ceo@example.com', phone: '13800000003', passwordHash }
];

export const contactDirectory = [
  {
    id: 'c-100',
    name: '陈敏',
    email: 'chenmin@example.com',
    phone: '13911112222',
    department: '工程部',
    title: '高级前端工程师',
    seat: 'A2-15',
    salary: 32000
  },
  {
    id: 'c-200',
    name: '赵强',
    email: 'zhaoqiang@example.com',
    phone: '13933334444',
    department: '人力资源',
    title: 'HRBP',
    seat: 'B1-08',
    salary: 28000
  }
];

export const leaveBalances: Record<string, { annual: number; sick: number; other: number }> = {
  'u-employee': { annual: 7, sick: 5, other: 3 },
  'u-hr': { annual: 12, sick: 8, other: 5 },
  'u-mgmt': { annual: 15, sick: 10, other: 10 }
};

export const knowledgeDocs: KnowledgeDoc[] = [];

export function addKnowledgeDoc(userId: string, name: string, size: number) {
  const doc: KnowledgeDoc = {
    id: randomUUID(),
    userId,
    name,
    size,
    status: 'processing',
    uploadedAt: new Date().toISOString()
  } as KnowledgeDoc;
  knowledgeDocs.push(doc);
  return doc;
}

export function maskContact(contact: typeof contactDirectory[number], role: Role) {
  const canSeePhone = role === 'hr' || role === 'management';
  const canSeeEmail = role === 'hr' || role === 'management';
  const canSeeSalary = role === 'hr';

  return {
    ...contact,
    phone: canSeePhone ? contact.phone : null,
    email: canSeeEmail ? contact.email : null,
    salary: canSeeSalary ? contact.salary : null
  };
}
