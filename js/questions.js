/* ============================================================
   EPSOS MORE — Question dataset
   Modeled on the real Biographical Exam structure (2025)
   13 questions total: 5 role questions + 8 case questions
   ============================================================ */

/* Each role question shares the same structure */
const ROLE_SUBQUESTIONS = [
  { id: "concentrated", lines: 3, words: 30, optional: true,
    he: "אם העבודה בוצעה במרוכז בימים בודדים או הייתה לא סדירה — כמה שעות הקדשת לכך?",
    ar: "إذا كان العمل مكثفاً في أيام معدودة أو غير منتظم — كم ساعة كرّستَ له؟",
    en: "If the work was concentrated on specific days or irregular — how many hours did you dedicate to it?"
  },
  { id: "describe", lines: 4, words: 60,
    he: "תאר בקצרה את התפקיד שלך, וציין אם התפקיד נעשה במסגרת \"מחויבות אישית\".",
    ar: "صف بإيجاز دورك، واذكر ما إذا كان قد جرى ضمن إطار \"الالتزام الشخصي\".",
    en: "Briefly describe your role, and note whether it was performed as part of \"personal commitment\" service."
  },
  { id: "responsibilities", lines: 5, words: 75,
    he: "תאר מה עשית בתפקידך, מה הייתה האחריות שלך, והאם היית אחראי על אנשים?",
    ar: "صف ما كنت تقوم به في دورك، ما هي مسؤولياتك، وهل كنت مسؤولاً عن أشخاص؟",
    en: "Describe what you did in your role, your responsibilities, and whether you were in charge of others."
  },
  { id: "treated", lines: 4, words: 60,
    he: "האם טיפלת באנשים? פרט כיצד ומדוע הם היו זקוקים לטיפול הזה.",
    ar: "هل قمت برعاية أشخاص؟ وضّح كيف ولماذا كانوا بحاجة إلى هذه الرعاية.",
    en: "Did you care for people? Explain how and why they needed that care."
  },
  { id: "collab", lines: 4, words: 60,
    he: "האם העבודה הייתה בעיקרה לבד או בשיתוף פעולה? כיצד התנהל שיתוף הפעולה?",
    ar: "هل كان العمل غالباً منفرداً أم بتعاون؟ كيف جرى التعاون؟",
    en: "Was the work mostly individual or collaborative? How did the collaboration unfold?"
  },
  { id: "training", lines: 4, words: 60,
    he: "האם עברת הכשרה? כמה זמן היא ארכה ומה למדת בה? פרט.",
    ar: "هل تلقيت تدريباً؟ كم استغرق وماذا تعلمت فيه؟ وضّح.",
    en: "Did you receive training? How long did it last and what did you learn? Elaborate."
  },
  { id: "paid", lines: 1, words: 15,
    he: "האם התפקיד היה בהתנדבות (ללא תמורה) או בשכר?",
    ar: "هل كان الدور تطوعاً (دون مقابل) أم بأجر؟",
    en: "Was the role voluntary (unpaid) or paid?"
  },
  { id: "achievement", lines: 5, words: 60,
    he: "ציין הישג או פעולה שאתה גאה בה. פרט מדוע ואיך הגעת להישג הזה.",
    ar: "اذكر إنجازاً أو فعلاً تفتخر به. وضّح لماذا وكيف وصلتَ إليه.",
    en: "Name an achievement or action you are proud of. Explain why and how you reached it."
  }
];

/* Building 5 role questions sharing the same sub-question template */
function makeRoleQuestion(n) {
  return {
    id: "role_" + n,
    type: "role",
    section: "roles",
    index: n,
    title: {
      he: `שאלת תפקיד ${n} מתוך 5`,
      ar: `سؤال الدور ${n} من 5`,
      en: `Role question ${n} of 5`
    },
    instructions: {
      he: "תאר תפקיד מתוך הניסיון שלך. אסור לציין תפקידים של טיפול בקרובי משפחה. בכל שאלות התפקידים — מותר לכתוב על מקרים מכיתה י׳ ומעלה.",
      ar: "صف دوراً من تجربتك. لا يُسمح بذكر أدوار رعاية أفراد الأسرة. في جميع أسئلة الأدوار — يُسمح بالكتابة عن حالات من الصف العاشر فما فوق.",
      en: "Describe a role from your experience. You may not list roles caring for family members. For all role questions, you may describe experiences from grade 10 onwards."
    },
    identification: true,
    subs: ROLE_SUBQUESTIONS
  };
}

/* Cases — 8 cases from the 2025 reconstruction */
const CASE_QUESTIONS = [
  {
    id: "case_criticism",
    title: {
      he: "מקרה: ביקורת קשה כלפי אדם קרוב",
      ar: "حالة: انتقاد حاد لشخص قريب",
      en: "Case: Harsh criticism toward a close person"
    },
    intro: {
      he: "תאר מקרה בו הבעת ביקורת קשה כלפי אדם קרוב על ההתנהגות שלו כלפי אחרים. תאר מי האדם ומה היו הדברים שנאמרו.",
      ar: "صف حالة وجّهتَ فيها انتقاداً حاداً لشخص قريب على سلوكه تجاه الآخرين. صف من هو الشخص وما الذي قيل.",
      en: "Describe a case in which you expressed harsh criticism toward a close person about their behavior toward others. Describe who the person is and what was said."
    },
    subs: [
      { he: "א. למה אמרת לו את הדברים?", ar: "أ. لماذا قلتَ له ذلك؟", en: "a. Why did you say those things?", lines: 4, words: 60 },
      { he: "ב. כיצד אמרת לו את הדברים האלה?", ar: "ب. كيف قلتَ له ذلك؟", en: "b. How did you say it?", lines: 4, words: 60 },
      { he: "ג. האם היו לך חששות מלהביע את הביקורת? מה היו?", ar: "ج. هل كانت لديك مخاوف من إبداء النقد؟ ماذا كانت؟", en: "c. Did you have concerns about expressing the criticism? What were they?", lines: 4, words: 60 },
      { he: "ד. איך המקרה הסתיים?", ar: "د. كيف انتهت الحالة؟", en: "d. How did the case end?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_verbal_violence",
    title: {
      he: "מקרה: נהגו כלפיך באלימות מילולית",
      ar: "حالة: تعرّضت لعنف لفظي",
      en: "Case: You experienced verbal violence"
    },
    intro: {
      he: "תאר מקרה בו נהגו כלפיך באלימות מילולית (לא בן משפחה). פרט מה קרה, מי היה האדם ובאיזה אופן נהג כלפיך באלימות מילולית.",
      ar: "صف حالة تعرّضت فيها لعنف لفظي (ليس من أحد أفراد العائلة). وضّح ما الذي حدث، من كان الشخص، وكيف تصرّف معك بعنف لفظي.",
      en: "Describe a case in which someone treated you with verbal violence (not a family member). Detail what happened, who the person was, and how the verbal violence unfolded."
    },
    subs: [
      { he: "א. מדוע, לדעתך, האדם השני נהג כך?", ar: "أ. لماذا، برأيك، تصرّف الشخص الآخر هكذا؟", en: "a. Why, in your view, did the other person act this way?", lines: 4, words: 60 },
      { he: "ב. כיצד פעלת לאחר המקרה?", ar: "ب. كيف تصرّفت بعد الحادثة؟", en: "b. How did you act after the incident?", lines: 4, words: 60 },
      { he: "ג. האם יש משהו שהיית משנה?", ar: "ج. هل هناك شيء كنت ستغيّره؟", en: "c. Is there anything you would have changed?", lines: 4, words: 60 },
      { he: "ד. ברפואה לעיתים קרובות נוהגים מולך באלימות מילולית. האם למדת משהו מהסיטואציה שיכול לעזור לך במקרים כאלו בעבודתך כרופא?", ar: "د. في الطب يحدث أحياناً أن يُعامَل الطبيب بعنف لفظي. هل تعلّمت من الموقف ما قد يساعدك في عملك كطبيب؟", en: "d. In medicine, doctors are sometimes subjected to verbal violence. Did you learn something from this situation that could help you in your future work as a physician?", lines: 5, words: 75 }
    ]
  },
  {
    id: "case_silence",
    title: {
      he: "מקרה: בחרת להבליג כדי להימנע מעימות",
      ar: "حالة: اخترت السكوت لتجنّب المواجهة",
      en: "Case: You chose to stay silent to avoid confrontation"
    },
    intro: {
      he: "תאר מקרה בו הבלגת על התנהגות של אדם כדי להימנע מעימות.",
      ar: "صف حالة سكتَّ فيها على تصرّف شخص لتجنّب المواجهة.",
      en: "Describe a case in which you stayed silent regarding someone's behavior in order to avoid confrontation."
    },
    subs: [
      { he: "א. מדוע בחרת שלא להגיב?", ar: "أ. لماذا اخترت ألّا تتجاوب؟", en: "a. Why did you choose not to respond?", lines: 4, words: 60 },
      { he: "ב. מה עשית בעקבות כך?", ar: "ب. ماذا فعلت بعد ذلك؟", en: "b. What did you do as a result?", lines: 4, words: 60 },
      { he: "ג. כיצד התפתח המצב לאחר מכן?", ar: "ج. كيف تطوّر الوضع لاحقاً؟", en: "c. How did the situation unfold afterwards?", lines: 4, words: 60 },
      { he: "ד. במבט לאחור, האם היית משנה את התנהגותך / פועל אחרת?", ar: "د. بنظرة استرجاعية، هل كنت ستغيّر سلوكك / تتصرف بشكل مختلف؟", en: "d. In hindsight, would you have changed your behavior / acted differently?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_cutoff",
    title: {
      he: "מקרה: ניתקת קשר מאדם קרוב",
      ar: "حالة: قطعت العلاقة مع شخص قريب",
      en: "Case: You cut off a close person"
    },
    intro: {
      he: "תאר מקרה בו ניתקת קשר מאדם קרוב (לא בן זוג).",
      ar: "صف حالة قطعت فيها العلاقة مع شخص قريب (ليس شريكاً عاطفياً).",
      en: "Describe a case in which you cut off contact with a close person (not a romantic partner)."
    },
    subs: [
      { he: "א. תאר את הקשר והסבר מדוע הוא נותק.", ar: "أ. صف العلاقة واشرح لماذا انقطعت.", en: "a. Describe the relationship and explain why it ended.", lines: 4, words: 60 },
      { he: "ב. כיצד ניתקת את הקשר?", ar: "ب. كيف قطعت العلاقة؟", en: "b. How did you sever the connection?", lines: 4, words: 60 },
      { he: "ג. האם היו קשיים במהלך התהליך? אם כן, הסבר. אם לא, מדוע אתה חושב שזה המצב?", ar: "ج. هل واجهتك صعوبات خلال العملية؟ إذا نعم، اشرح. إذا لا، لماذا برأيك؟", en: "c. Were there difficulties during the process? If yes, explain. If not, why do you think that is?", lines: 4, words: 60 },
      { he: "ד. במבט לאחור, האם היית פועל אחרת?", ar: "د. بنظرة استرجاعية، هل كنت ستتصرّف بشكل مختلف؟", en: "d. In hindsight, would you have acted differently?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_unethical_task",
    title: {
      he: "מקרה: קיבלת משימה שלא נכון לבצע",
      ar: "حالة: كُلِّفت بمهمة لم يكن من الصواب تنفيذها",
      en: "Case: You were given a task that wasn't right to perform"
    },
    intro: {
      he: "תאר מקרה בו ניתנה לך משימה מאדם שאחראי עליך וחשבת שלא נכון לבצע אותה — מסיבה מקצועית או מוסרית.",
      ar: "صف حالة كُلِّفت فيها بمهمة من قِبل شخص مسؤول عنك، ورأيت أنه ليس من الصواب تنفيذها — لسبب مهني أو أخلاقي.",
      en: "Describe a case in which a supervisor gave you a task you believed was not right to perform — for professional or moral reasons."
    },
    subs: [
      { he: "א. תאר את המשימה.", ar: "أ. صف المهمة.", en: "a. Describe the task.", lines: 4, words: 60 },
      { he: "ב. מה לדעתך היו הסיבות לנתינת המשימה?", ar: "ب. ما الأسباب برأيك التي دفعت إلى تكليفك بها؟", en: "b. What do you believe were the reasons for assigning it?", lines: 4, words: 60 },
      { he: "ג. איך הגבת בעת קבלת המשימה?", ar: "ج. كيف كان ردّ فعلك عند تلقّي المهمة؟", en: "c. How did you react when you received the task?", lines: 4, words: 60 },
      { he: "ד. מה עשית לאחר עשיית המשימה? כיצד הסתיים המקרה?", ar: "د. ماذا فعلت بعد تنفيذها؟ كيف انتهت الحالة؟", en: "d. What did you do afterwards? How did the case end?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_caregiving",
    title: {
      he: "מקרה: דאגת לאדם קרוב עד כדי פגיעה בתפקוד",
      ar: "حالة: اعتنيت بشخص قريب حتى أثّر ذلك على أدائك اليومي",
      en: "Case: You cared for a close person to the point of harming your own functioning"
    },
    intro: {
      he: "תאר מקרה בו דאגת לאדם קרוב, עד כדי פגיעה בתפקוד היומיומי שלך.",
      ar: "صف حالة اعتنيت فيها بشخص قريب حتى تأثّر أداؤك اليومي.",
      en: "Describe a case in which you cared for a close person to the extent that it harmed your day-to-day functioning."
    },
    subs: [
      { he: "א. מה היה המקרה? מי היה האדם? מה הקשר ביניכם? למה דאגת לו?", ar: "أ. ما كانت الحالة؟ من كان الشخص؟ ما العلاقة بينكما؟ ولماذا اعتنيت به؟", en: "a. What was the situation? Who was the person? What is your relationship? Why did you care for them?", lines: 5, words: 75 },
      { he: "ב. מה היו ההשלכות? איך זה השפיע על התפקוד היומיומי שלך?", ar: "ب. ما كانت التبعات؟ كيف أثّر ذلك على أدائك اليومي؟", en: "b. What were the consequences? How did it affect your daily functioning?", lines: 4, words: 60 },
      { he: "ג. האם שיתפת את מי שאתה דואג לו? מדוע?", ar: "ج. هل أطلعت من تعتني به؟ لماذا؟", en: "c. Did you share this with the person you were caring for? Why?", lines: 4, words: 60 },
      { he: "ד. מה עשית לגבי המצב?", ar: "د. ماذا فعلت حيال الوضع؟", en: "d. What did you do about the situation?", lines: 4, words: 60 },
      { he: "ה. איך המצב הסתיים?", ar: "هـ. كيف انتهت الحالة؟", en: "e. How did the situation end?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_dilemma",
    title: {
      he: "מקרה: החלטה בין שתי אופציות לא טובות",
      ar: "حالة: قرار بين خيارين كلاهما غير جيد",
      en: "Case: A decision between two bad options"
    },
    intro: {
      he: "תאר מקרה בו היית צריך לקבל החלטה בין שתי אופציות לא טובות, וידעת שיפגעו באחרים.",
      ar: "صف حالة اضطُررت فيها إلى الاختيار بين خيارين سيّئين، علمت أنّ كليهما سيمسّ بآخرين.",
      en: "Describe a case in which you had to choose between two bad options, knowing both would harm others."
    },
    subs: [
      { he: "א. בין מה למה התלבטת ולמה זה פוגע בשני הצדדים?", ar: "أ. بين أيّ خيارَين كنت تتردّد ولماذا يضرّ كلاهما؟", en: "a. Between what and what did you hesitate, and why does it harm both sides?", lines: 4, words: 60 },
      { he: "ב. איך הגעת לבחירה שעשית?", ar: "ب. كيف وصلت إلى الاختيار الذي اتخذته؟", en: "b. How did you arrive at the choice you made?", lines: 4, words: 60 },
      { he: "ג. מה בסוף עשית?", ar: "ج. ماذا فعلت في النهاية؟", en: "c. What did you ultimately do?", lines: 4, words: 60 },
      { he: "ד. איך הסתיים המקרה? מה לקחת איתך הלאה?", ar: "د. كيف انتهت الحالة؟ ماذا أخذت معك للمستقبل؟", en: "d. How did the case end? What did you take from it going forward?", lines: 4, words: 60 }
    ]
  },
  {
    id: "case_failure",
    title: {
      he: "מקרה: לא הצלחת להשיג מטרה חשובה",
      ar: "حالة: لم تنجح في تحقيق هدف مهم",
      en: "Case: You failed to reach an important goal"
    },
    intro: {
      he: "תאר מקרה בו לא הצלחת להשיג דבר/מטרה חשובה שרצית, וגם לבסוף לא הצלחת.",
      ar: "صف حالة لم تنجح فيها في تحقيق شيء/هدف مهم رغبت به، ولم تنجح في النهاية أيضاً.",
      en: "Describe a case in which you didn't manage to reach something / an important goal you wanted, and ultimately did not succeed."
    },
    subs: [
      { he: "א. מה עשית על מנת להשיג את הדבר?", ar: "أ. ماذا فعلت من أجل تحقيقه؟", en: "a. What did you do in order to achieve it?", lines: 4, words: 60 },
      { he: "ב. מדוע אתה חושב שלא הצלחת להשיג את המטרה?", ar: "ب. لماذا برأيك لم تنجح في تحقيق الهدف؟", en: "b. Why do you think you didn't reach the goal?", lines: 4, words: 60 },
      { he: "ג. כיצד התקדמת לאחר שהתבשר לך שאינך יכול להשיג את המטרה?", ar: "ج. كيف تقدّمت بعد أن تبيّن لك أنك لن تحقّقه؟", en: "c. How did you move forward after you learned you couldn't reach it?", lines: 4, words: 60 },
      { he: "ד. איך הרגשת לאחר שלא השגת את המטרה?", ar: "د. كيف شعرت بعد عدم تحقيقك للهدف؟", en: "d. How did you feel after not reaching the goal?", lines: 4, words: 60 }
    ]
  }
];

/* Build the 13-question array: 5 roles + 8 cases */
window.QUESTIONS = [
  makeRoleQuestion(1),
  makeRoleQuestion(2),
  makeRoleQuestion(3),
  makeRoleQuestion(4),
  makeRoleQuestion(5),
  ...CASE_QUESTIONS.map((q, i) => ({
    ...q,
    type: "case",
    section: "cases",
    index: i + 1
  }))
];
