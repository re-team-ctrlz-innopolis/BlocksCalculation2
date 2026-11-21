function bindTutorialEvents() {
    const dialog = document.getElementById('tutorialDialog');
    const steps = [...dialog.querySelectorAll('[data-tutorial-step]')];
    const description = document.getElementById('tutorialDescription');
    const previous = document.getElementById('btnTutorialPrevious');
    const next = document.getElementById('btnTutorialNext');
    let activeStep = 0;

    const markTutorialSeen = () => {
        try {
            localStorage.setItem('blocks-calculator-tutorial-seen', 'true');
        } catch (error) {
            console.warn('Could not save tutorial completion state.', error);
        }
    };

    const renderStep = () => {
        steps.forEach((step, index) => { step.hidden = index !== activeStep; });
        description.textContent = `Step ${activeStep + 1} of ${steps.length}`;
        previous.disabled = activeStep === 0;
        next.textContent = activeStep === steps.length - 1 ? 'Finish' : 'Next';
    };

    const openGuide = () => {
        activeStep = 0;
        renderStep();
        if (!dialog.open) dialog.showModal();
    };

    const closeGuide = () => {
        markTutorialSeen();
        dialog.close();
    };

    document.getElementById('btnGuide').addEventListener('click', openGuide);
    document.getElementById('btnTutorialClose').addEventListener('click', closeGuide);
    document.getElementById('btnTutorialSkip').addEventListener('click', closeGuide);
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeGuide();
        }
    });
    previous.addEventListener('click', () => {
        if (activeStep > 0) {
            activeStep--;
            renderStep();
        }
    });
    next.addEventListener('click', () => {
        if (activeStep === steps.length - 1) {
            closeGuide();
            return;
        }
        activeStep++;
        renderStep();
    });
    dialog.addEventListener('close', markTutorialSeen);

    let hasSeenTutorial = false;
    try {
        hasSeenTutorial = localStorage.getItem('blocks-calculator-tutorial-seen') === 'true';
    } catch (error) {
        console.warn('Could not read tutorial completion state. The guide will be shown.', error);
    }
    if (!hasSeenTutorial) openGuide();
}

bindTutorialEvents();
