(() => {
  'use strict';
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add({desktop:'(min-width: 1001px)',mobile:'(max-width: 1000px)',reduce:'(prefers-reduced-motion: reduce)'}, context => {
    if (context.conditions.reduce) return;
    const desktop = context.conditions.desktop;
    gsap.to('.scroll-progress',{scaleX:1,ease:'none',scrollTrigger:{trigger:document.documentElement,start:'top top',end:'max',scrub:true}});
    gsap.to('.hero-art',{yPercent:14,scale:1.08,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom top',scrub:1}});
    gsap.to('.hero-content',{y:desktop?130:50,opacity:.25,ease:'none',scrollTrigger:{trigger:'.hero',start:'15% top',end:'bottom top',scrub:1}});
    gsap.to('.date-stamp',{rotation:-35,y:-70,ease:'none',scrollTrigger:{trigger:'.hero',start:'top top',end:'bottom top',scrub:1}});
    gsap.to('.warning-tape div',{xPercent:-25,ease:'none',scrollTrigger:{trigger:'.warning-tape',start:'top bottom',end:'bottom top',scrub:1}});
    if (desktop) {
      const scene=gsap.timeline({scrollTrigger:{trigger:'.experience',start:'top top',end:'+=900',pin:true,scrub:1,anticipatePin:1}});
      scene.fromTo('.night-portrait',{clipPath:'inset(10% 14% 10% 14%)'},{clipPath:'inset(0% 0% 0% 0%)',duration:1},0)
        .fromTo('.night-portrait img',{scale:1.35},{scale:1,duration:1.5},0)
        .fromTo('.experience-copy',{x:60},{x:0,duration:1},0)
        .to('.night-portrait > span',{y:-80,duration:1},.3);
    } else {
      gsap.fromTo('.night-portrait img',{scale:1.15},{scale:1,ease:'none',scrollTrigger:{trigger:'.experience',start:'top bottom',end:'bottom top',scrub:1}});
    }
    gsap.utils.toArray('.music-row').forEach((row,i)=>{
      gsap.from(row.querySelector('h3'),{x:i%2?100:-100,ease:'none',scrollTrigger:{trigger:row,start:'top bottom',end:'center center',scrub:1}});
      gsap.from(row.querySelector('.sound-bars'),{scaleY:.2,ease:'none',scrollTrigger:{trigger:row,start:'top bottom',end:'bottom center',scrub:1}});
    });
    gsap.utils.toArray('.section-heading, .bar-menu dl > div, .age-note, .faq > div:first-child').forEach(el=>{
      gsap.from(el,{y:45,duration:.8,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 93%',once:true}});
    });
    gsap.utils.toArray('.admission').forEach((el,i)=>{
      gsap.from(el,{y:desktop?90:40,rotation:desktop?(i-1)*5:0,duration:.9,delay:desktop?i*.12:0,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 95%',once:true}});
    });
    gsap.from('.closing p',{x:desktop?-80:-25,ease:'none',scrollTrigger:{trigger:'.closing',start:'top bottom',end:'center center',scrub:1}});
  });
  document.querySelectorAll('.questions details').forEach(el=>el.addEventListener('toggle',()=>ScrollTrigger.refresh(true)));
  if (document.fonts) document.fonts.ready.then(()=>ScrollTrigger.refresh());
  window.addEventListener('load',()=>ScrollTrigger.refresh(),{once:true});
})();
