import './checkboxTools.css';

let checkboxTabIndex = 1;

let callbacks = {};

// fork: `color` is optional — pass one and the row gets a swatch at its right
// edge in that colour, so the SponsorBlock category rows show which colour
// their markers are drawn in on the timeline. Rows without it are unchanged.
function add(name, label, checked = false, callback = null, color = null) {
  /*
  <div class="toggler-wrapper" for="adblock">
    <div type="checkbox" tabindex="1" checked="checked">
      <div class="toggler-slider">
        <div class="toggler-knob"></div>
      </div>
    </div>
    <div class="desc">Enable AdBlocking</div>
    <div class="ytaf-swatch"></div>
  </div>
  */

  const wrapper = document.createElement('div');
  wrapper.classList.add('toggler-wrapper');

  const sliderDiv = document.createElement('div');
  sliderDiv.classList.add('toggler-slider');
  const knobDiv = document.createElement('div');
  knobDiv.classList.add('toggler-knob');
  sliderDiv.appendChild(knobDiv);

  const checkboxSliderDiv = document.createElement('div');
  checkboxSliderDiv.setAttribute('id', name);
  checkboxSliderDiv.setAttribute('type', 'checkbox');
  checkboxSliderDiv.setAttribute('tabindex', checkboxTabIndex);
  checkboxSliderDiv.appendChild(sliderDiv);

  const divabel = document.createElement('div');
  divabel.classList.add('desc');
  divabel.textContent = label;

  wrapper.appendChild(checkboxSliderDiv);
  wrapper.appendChild(divabel);

  if (color) {
    const swatch = document.createElement('div');
    swatch.classList.add('ytaf-swatch');
    swatch.style.backgroundColor = color;
    wrapper.appendChild(swatch);
  }

  if (checked) {
    checkboxSliderDiv.setAttribute('checked', 'checked');
  }

  callbacks[checkboxTabIndex] = (newState) => {
    if (callback != null) {
      callback(newState);
    }
  };

  const cb = (evt) => {
    const newState = toggleCheck(name);
  };

  wrapper.addEventListener(
    'click',
    (evt) => {
      // If a keyboard handler just toggled this control, ignore the synthesized click
      if (wrapper.dataset.ytafSkipClick === '1') {
        delete wrapper.dataset.ytafSkipClick;
        return;
      }
      cb(evt);
    },
    true
  );
  checkboxSliderDiv.addEventListener('focus', () => {
    wrapper.classList.add('ytaf-focused');
  });
  checkboxSliderDiv.addEventListener('blur', () => {
    wrapper.classList.remove('ytaf-focused');
  });

  checkboxTabIndex += 1;

  return wrapper;
}

function isChecked(name) {
  if (!name) {
    return;
  }
  const sliceDiv = document.querySelector('#' + name);
  return sliceDiv.hasAttribute('checked');
}

function toggleCheck(name) {
  if (!name) {
    return;
  }
  if (isChecked(name)) {
    uncheck(name);
    return false;
  } else {
    check(name);
    return true;
  }
}

function check(name) {
  if (!name) {
    return;
  }
  const sliceDiv = document.querySelector('#' + name);
  sliceDiv.setAttribute('checked', 'checked');
  callbacks[sliceDiv.tabIndex](true);
}

function uncheck(name) {
  if (!name) {
    return;
  }
  const sliceDiv = document.querySelector('#' + name);
  sliceDiv.removeAttribute('checked');
  callbacks[sliceDiv.tabIndex](false);
}

function remove(name) {
  if (!name) {
    return;
  }
  const sliceDiv = document.querySelector('#' + name);
  sliceDiv.removeEventListener('click', callbacks[sliceDiv.tabIndex]);
}

export const checkboxTools = {
  add: add,
  isChecked: isChecked,
  toggleCheck: toggleCheck,
  check: check,
  uncheck: uncheck,
  remove: remove
};
