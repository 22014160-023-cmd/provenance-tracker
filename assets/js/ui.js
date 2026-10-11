document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.glass-card').forEach(c=>{
    c.addEventListener('mousemove',e=>{
      const r=c.getBoundingClientRect();
      c.style.setProperty('--mx',((e.clientX-r.left)/r.width)*100+'%');
      c.style.setProperty('--my',((e.clientY-r.top)/r.height)*100+'%');
    });
  });
});
