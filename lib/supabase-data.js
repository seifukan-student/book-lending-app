const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。');
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return _client;
}

function escapeIlike(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function toBookRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    fields: {
      タイトル: row.title,
      Title: row.title,
      著者: row.author,
      Author: row.author,
      status: row.status,
      Status: row.status
    }
  };
}

function toStudentRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    fields: {
      名前: row.name,
      Name: row.name,
      生徒ID: row.external_student_id,
      StudentID: row.external_student_id
    }
  };
}

function toLoanRecord(row) {
  if (!row) return null;
  const bookTitle = row.books && row.books.title != null ? row.books.title : null;
  return {
    id: row.id,
    fields: {
      本: [row.book_id],
      生徒: [row.student_id],
      貸出日: row.loan_date,
      返却期限: row.due_date,
      返却状況: row.return_status,
      延長回数: row.extend_count ?? 0,
      'タイトル (from 本)': bookTitle != null ? [bookTitle] : [],
      実際の返却日: row.actual_return_date
    }
  };
}

async function searchBookByTitle(title) {
  const supabase = getClient();
  const t = String(title || '').trim();
  if (t.length < 2) return null;
  const pattern = `%${escapeIlike(t)}%`;
  const { data, error } = await supabase
    .from('books')
    .select('id,title,author,status')
    .ilike('title', pattern)
    .limit(1);
  if (error) throw error;
  if (!data || !data.length) return null;
  return toBookRecord(data[0]);
}

async function getBookById(bookId) {
  const supabase = getClient();
  const id = String(bookId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('books')
    .select('id,title,author,status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toBookRecord(data) : null;
}

async function getStudentById(studentRowId) {
  const supabase = getClient();
  const id = String(studentRowId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toStudentRecord(data) : null;
}

async function getStudentInfo(nameOrId) {
  const supabase = getClient();
  const rawInputName = String(nameOrId || '').trim();
  if (!rawInputName) return null;

  const { data: byId } = await supabase
    .from('students')
    .select('*')
    .eq('external_student_id', rawInputName)
    .maybeSingle();
  if (byId) return toStudentRecord(byId);

  const { data: byName } = await supabase
    .from('students')
    .select('*')
    .eq('name', rawInputName)
    .maybeSingle();
  if (byName) return toStudentRecord(byName);

  const nameWithoutSpace = rawInputName.replace(/\s+/g, '');
  const { data: byNameNoSpace } = await supabase
    .from('students')
    .select('*')
    .eq('name', nameWithoutSpace)
    .maybeSingle();
  if (byNameNoSpace) return toStudentRecord(byNameNoSpace);

  const { data: all } = await supabase.from('students').select('*');
  if (!all || !all.length) return null;
  const normalizedInput = nameWithoutSpace;
  const match = all.find((row) => {
    const studentName = row.name || '';
    const sid = row.external_student_id || '';
    const normName = studentName.replace(/\s+/g, '');
    return sid === rawInputName || normName === normalizedInput;
  });
  return match ? toStudentRecord(match) : null;
}

async function createLoanRecord(book, student) {
  const supabase = getClient();
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + 14);
  const loanDateStr = today.toISOString().split('T')[0];
  const dueStr = dueDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('loans')
    .insert({
      book_id: book.id,
      student_id: student.id,
      loan_date: loanDateStr,
      due_date: dueStr,
      return_status: '貸出中',
      extend_count: 0
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id, fields: {} };
}

async function updateBookStatusTo(bookId, status) {
  const supabase = getClient();
  const { error } = await supabase.from('books').update({ status }).eq('id', bookId);
  if (error) throw error;
  await new Promise((r) => setTimeout(r, 300));
}

async function findActiveLoan(book, student) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('book_id', book.id)
    .eq('student_id', student.id)
    .eq('return_status', '貸出中')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: bookRow } = await supabase.from('books').select('title').eq('id', data.book_id).single();
  return toLoanRecord({ ...data, books: bookRow });
}

async function processReturn(loanRecord) {
  const supabase = getClient();
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('loans')
    .update({
      return_status: '貸出可',
      actual_return_date: today
    })
    .eq('id', loanRecord.id);
  if (error) {
    const retryValues = ['貸出可', '利用可能', 'Available'];
    for (const value of retryValues) {
      const { error: e2 } = await supabase
        .from('loans')
        .update({ return_status: value, actual_return_date: today })
        .eq('id', loanRecord.id);
      if (!e2) return;
    }
    throw error;
  }
}

async function checkBookAvailability(bookId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('loans')
    .select('id,loan_date')
    .eq('book_id', bookId)
    .eq('return_status', '貸出中');
  if (error) {
    console.error('❌ 書籍利用可能性チェックエラー:', error.message);
    return false;
  }
  if (!data || data.length === 0) return true;
  return false;
}

async function checkStudentLoanCount(student) {
  const supabase = getClient();
  const { data: loans, error } = await supabase
    .from('loans')
    .select('id, loan_date, due_date, return_status, extend_count, books(title)')
    .eq('student_id', student.id)
    .eq('return_status', '貸出中');
  if (error) {
    console.error('❌ 貸出冊数チェックエラー:', error.message);
    return { count: 0, isAtLimit: false, currentLoans: [] };
  }
  const currentLoans = (loans || []).map((row) => toLoanRecord(row));
  const loanCount = currentLoans.length;
  return {
    count: loanCount,
    isAtLimit: loanCount >= 4,
    currentLoans
  };
}

async function getLoanByIdForExtend(loanId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('loans')
    .select('*, books(title)')
    .eq('id', loanId)
    .maybeSingle();
  if (error) throw error;
  return data ? toLoanRecord(data) : null;
}

async function updateLoanDueAndExtend(loanId, newDueDateStr, newExtendCount) {
  const supabase = getClient();
  const { error } = await supabase
    .from('loans')
    .update({ due_date: newDueDateStr, extend_count: newExtendCount })
    .eq('id', loanId);
  if (error) throw error;
}

async function registerBook(bookData) {
  const supabase = getClient();
  const fields = {
    title: bookData.title,
    status: '貸出可'
  };
  if (bookData.author) fields.author = bookData.author;
  if (bookData.publisher && bookData.author) {
    fields.author = `${bookData.author} (${bookData.publisher})`;
  } else if (bookData.publisher && !bookData.author) {
    fields.author = bookData.publisher;
  }
  if (bookData.tags && bookData.tags.length > 0) {
    fields.tags = bookData.tags.join(', ');
  }
  const { data, error } = await supabase.from('books').insert(fields).select('id,title,author,status').single();
  if (error) throw error;
  return toBookRecord(data);
}

async function debugLoansForBook(bookId) {
  const supabase = getClient();
  const { data, error } = await supabase.from('loans').select('*').eq('book_id', bookId);
  if (error) throw error;
  return data || [];
}

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = {
  getClient,
  isConfigured,
  searchBookByTitle,
  getBookById,
  getStudentById,
  getStudentInfo,
  createLoanRecord,
  updateBookStatusTo,
  findActiveLoan,
  processReturn,
  checkBookAvailability,
  checkStudentLoanCount,
  getLoanByIdForExtend,
  updateLoanDueAndExtend,
  registerBook,
  debugLoansForBook,
  toBookRecord
};
