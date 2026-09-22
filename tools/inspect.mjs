import { MATERIALS as M } from '../js/data.js';
console.log('阅读:', M.reading[0].paragraphs[0].slice(0, 160));
console.log('\n听力Q1:', M.listening[0].questions[0].split('\n').slice(0, 2).join(' | '));
console.log('\n口语P1:', M.speaking[0].part1[0]);
console.log('口语P3:', M.speaking[0].part3[0]);
console.log('\n写作示例重复连接词:', /However,\s*However,/.test(M.writing[0].example) ? '仍有' : '已修复');
