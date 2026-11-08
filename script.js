/*
 * Список задач.
 *
 * Задачи хранятся в localStorage массивом { id, text, done }, поэтому
 * переживают обновление страницы. Интерфейс меняется точечно: добавляется,
 * отмечается или удаляется одна строка, а не перерисовывается весь список.
 * Так не сбивается фокус клавиатуры и работают анимации.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "todo-list:tasks";
  const MAX_LENGTH = 200;

  const form = document.getElementById("add-form");
  const input = document.getElementById("new-task");
  const board = document.getElementById("board");
  const list = document.getElementById("task-list");
  const empty = document.getElementById("empty-state");
  const counter = document.getElementById("counter");
  const progress = document.getElementById("progress");
  const progressBar = document.getElementById("progress-bar");
  const template = document.getElementById("task-template");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let tasks = loadTasks();

  /* ---- хранение --------------------------------------------------------- */

  function loadTasks() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(data)) return [];

      // Берём только записи правильной формы: хранилище могли испортить руками.
      return data
        .filter((task) => task && typeof task.id === "string" && typeof task.text === "string")
        .map((task) => ({ id: task.id, text: task.text, done: Boolean(task.done) }));
    } catch {
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // Хранилище недоступно (например, запрещено настройками браузера).
      // Список продолжит работать, просто не сохранится.
    }
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function findTask(id) {
    return tasks.find((task) => task.id === id);
  }

  /* ---- отрисовка -------------------------------------------------------- */

  function createItem(task) {
    const item = template.content.firstElementChild.cloneNode(true);
    item.dataset.id = task.id;
    item.classList.toggle("is-done", task.done);

    item.querySelector(".checkbox").checked = task.done;
    // textContent, а не innerHTML: текст задачи никогда не станет разметкой.
    item.querySelector(".text").textContent = task.text;
    item.querySelector(".delete").setAttribute("aria-label", `Удалить задачу «${task.text}»`);

    return item;
  }

  function renderAll() {
    list.replaceChildren(...tasks.map(createItem));
    updateSummary();
  }

  /** Счётчик, полоса прогресса и заглушка пустого списка. */
  function updateSummary() {
    const total = tasks.length;
    const done = tasks.filter((task) => task.done).length;
    const isEmpty = total === 0;
    const isComplete = !isEmpty && done === total;

    empty.hidden = !isEmpty;
    list.hidden = isEmpty;
    counter.hidden = isEmpty;
    progress.hidden = isEmpty;
    board.classList.toggle("is-complete", isComplete);

    if (isEmpty) return;

    counter.textContent = isComplete
      ? `Всё сделано: ${done} из ${total}`
      : `Выполнено ${done} из ${total}`;
    progressBar.style.inlineSize = `${(done / total) * 100}%`;
  }

  /* ---- действия --------------------------------------------------------- */

  function addTask(text) {
    const task = { id: createId(), text: text.slice(0, MAX_LENGTH), done: false };

    // Новая задача встаёт наверх — сразу под строкой ввода.
    tasks.unshift(task);
    saveTasks();

    const item = createItem(task);
    item.classList.add("is-new");
    item.addEventListener("animationend", () => item.classList.remove("is-new"), { once: true });
    list.prepend(item);
    updateSummary();
  }

  function toggleTask(item, done) {
    const task = findTask(item.dataset.id);
    if (!task) return;

    task.done = done;
    item.classList.toggle("is-done", done);
    saveTasks();
    updateSummary();
  }

  function removeTask(item) {
    if (item.classList.contains("is-removing")) return;

    const id = item.dataset.id;
    tasks = tasks.filter((task) => task.id !== id);
    saveTasks();

    // Если удаляли с клавиатуры, фокус переходит к соседней задаче или в поле ввода.
    const hadFocus = item.contains(document.activeElement);
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;

      const neighbour = findNeighbour(item);
      item.remove();
      updateSummary();

      if (hadFocus) {
        (neighbour ? neighbour.querySelector(".delete") : input).focus();
      }
    };

    if (reducedMotion.matches) {
      finish();
      return;
    }

    item.classList.add("is-removing");
    item.addEventListener("animationend", finish, { once: true });
    // Подстраховка: если анимация не отыграла (например, вкладка в фоне).
    setTimeout(finish, 400);
  }

  function findNeighbour(item) {
    const isAlive = (el) => el && !el.classList.contains("is-removing");
    let next = item.nextElementSibling;
    while (next && !isAlive(next)) next = next.nextElementSibling;
    if (next) return next;

    let prev = item.previousElementSibling;
    while (prev && !isAlive(prev)) prev = prev.previousElementSibling;
    return prev;
  }

  function flagInvalid() {
    form.classList.remove("is-invalid");
    void form.offsetWidth; // перезапуск анимации, если жмут несколько раз подряд
    form.classList.add("is-invalid");
  }

  /* ---- события ---------------------------------------------------------- */

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = input.value.trim();
    input.value = "";
    input.focus();

    if (!text) {
      flagInvalid();
      return;
    }

    addTask(text);
  });

  form.addEventListener("animationend", (event) => {
    if (event.animationName === "shake") form.classList.remove("is-invalid");
  });

  list.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".checkbox");
    if (checkbox) toggleTask(checkbox.closest(".item"), checkbox.checked);
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest(".delete");
    if (button) removeTask(button.closest(".item"));
  });

  // Список открыт в двух вкладках — изменения в одной сразу видны в другой.
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    tasks = loadTasks();
    renderAll();
  });

  renderAll();
})();
